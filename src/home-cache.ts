import {profileStorage} from './profile-storage';
import {catalogSelection,type CatalogRow} from './catalogs';
import type {Addon,Meta} from './media';

// The TV shows the browse rows from its last visit at launch, then swaps in
// fresh ones as each catalog answers, so home never opens on empty shelves.
// The copy stays on this device: device sync only reads its own keys.
const cacheKey='hasimio:home-rows:v1';
const DESCRIPTION_LIMIT=320;
type SavedRow=Pick<CatalogRow,'key'|'title'|'source'|'items'|'skip'|'hasMore'>;

const rowKey=(addon:Addon,catalog:CatalogRow['catalog'])=>`${addon.manifest.id}:${catalog.type}:${catalog.id}`;

/** Only what a poster and the spotlight need; episode lists are fetched on open. */
function compact(meta:Meta):Meta{
  const {videos:_videos,metadataFetchedAt:_fetched,metadataError:_error,...rest}=meta;
  return rest.description&&rest.description.length>DESCRIPTION_LIMIT?{...rest,description:rest.description.slice(0,DESCRIPTION_LIMIT).replace(/\s+\S*$/,'')+'…'}:rest;
}

/** Last visit's home rows, matched to the sources that are enabled now. */
export function cachedHomeRows(addons:Addon[],storage:Pick<Storage,'getItem'>=profileStorage):CatalogRow[]{
  try{
    const saved=JSON.parse(storage.getItem(cacheKey)??'null') as {rows?:SavedRow[]}|null;
    if(!saved||!Array.isArray(saved.rows))return [];
    const byKey=new Map(saved.rows.filter(row=>row&&typeof row.key==='string'&&Array.isArray(row.items)).map(row=>[row.key,row]));
    return catalogSelection(addons,'','All').flatMap(({addon,catalog})=>{
      const row=byKey.get(rowKey(addon,catalog));
      const items=row?.items.filter(meta=>meta&&typeof meta.id==='string'&&typeof meta.type==='string'&&typeof meta.name==='string')??[];
      return row&&items.length?[{...row,items,addon,catalog,hasMore:false,cached:true}]:[];
    });
  }catch{return [];}
}

export function storeHomeRows(rows:CatalogRow[],storage:Pick<Storage,'setItem'>=profileStorage){
  const saved:SavedRow[]=rows.map(({key,title,source,items,skip,hasMore})=>({key,title,source,items:items.map(compact),skip,hasMore}));
  try{storage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),rows:saved}));}catch{/* Storage is full or blocked: home simply loads as before. */}
}

/** True for rows restored from the last visit; they cannot load further pages. */
export function cachedRow(row:CatalogRow){return (row as CatalogRow&{cached?:boolean}).cached===true;}

/**
 * Rows to show while a browse request is still answering: catalogs that have
 * answered replace their old row in place, and the others keep their previous
 * row until they answer, so shelves neither vanish nor jump. Rows already on
 * screen from this request keep any pages loaded since.
 */
export function mergeRows(order:string[],fresh:Map<string,CatalogRow>,previous:CatalogRow[],placed:Set<string>,finished:boolean):CatalogRow[]{
  const current=new Map(previous.map(row=>[row.key,row]));
  return order.flatMap(key=>{
    const row=fresh.get(key);
    if(row)return [placed.has(key)?current.get(key)??row:row];
    const old=current.get(key);
    return !finished&&old?[old]:[];
  });
}
