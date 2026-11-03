package app.hasimio.android;
import android.content.*;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

/** Exposes exactly the downloaded update, read-only, to Android's installer. */
public class UpdateProvider extends ContentProvider {
  @Override public boolean onCreate(){return true;}
  private File file(Uri uri)throws FileNotFoundException{
    if(!"/update.apk".equals(uri.getPath()))throw new FileNotFoundException();
    return new File(getContext().getCacheDir(),"updates/update.apk");
  }
  @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{
    if(!"r".equals(mode))throw new FileNotFoundException();
    return ParcelFileDescriptor.open(file(uri),ParcelFileDescriptor.MODE_READ_ONLY);
  }
  @Override public String getType(Uri uri){return "application/vnd.android.package-archive";}
  @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){
    try{File f=file(uri);MatrixCursor cursor=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE});cursor.addRow(new Object[]{"Hasimio.apk",f.length()});return cursor;}catch(IOException error){return null;}
  }
  @Override public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
  @Override public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
  @Override public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
}
