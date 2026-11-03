package app.hasimio.android;

import android.app.AlertDialog;
import android.content.*;
import android.content.pm.*;
import android.net.Uri;
import android.provider.Settings;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.*;
import org.json.*;

final class Updates {
  private static final String REPO="https://github.com/calinadrian/hasimio";
  private final MainActivity activity;
  private final ExecutorService worker=Executors.newSingleThreadExecutor();
  private final JSONObject state=new JSONObject();
  private boolean busy;
  private long checked;
  private File downloaded;
  Updates(MainActivity activity){this.activity=activity;set("idle",null,null,0);}
  synchronized String state(){return state.toString();}
  private synchronized void set(String status,String version,String message,int percent){
    try{state.put("current",BuildConfig.VERSION_NAME).put("status",status).put("version",version==null?JSONObject.NULL:version).put("message",message==null?JSONObject.NULL:message).put("percent",percent).put("checkedAt",checked);}catch(JSONException ignored){}
    activity.emit(state.toString());
  }
  synchronized void check(){
    if(busy||worker.isShutdown())return;
    if(downloaded!=null&&downloaded.isFile()){set("ready",state.optString("version"),null,100);return;}
    busy=true;set("checking",null,null,0);
    worker.submit(()->{
      String version=null;
      try{
        JSONObject manifest=null;int best=BuildConfig.VERSION_CODE;
        // Dedicated Android tags keep Windows/macOS/TV release ordering independent.
        for(int page=1;page<=3;page++){
          JSONArray releases=new JSONArray(new String(bytes("https://api.github.com/repos/calinadrian/hasimio/releases?per_page=30&page="+page,2*1024*1024),java.nio.charset.StandardCharsets.UTF_8));
          for(int i=0;i<releases.length();i++){
            JSONObject release=releases.getJSONObject(i);
            if(release.optBoolean("draft")||release.optBoolean("prerelease")||!release.optString("tag_name").startsWith("android-v"))continue;
            JSONArray assets=release.getJSONArray("assets");
            for(int j=0;j<assets.length();j++){
              JSONObject asset=assets.getJSONObject(j);
              if(!"hasimio-android-update.json".equals(asset.optString("name")))continue;
              String url=asset.getString("browser_download_url");requireReleaseUrl(url);
              JSONObject candidate=new JSONObject(new String(bytes(url,32768),java.nio.charset.StandardCharsets.UTF_8));
              int code=candidate.getInt("versionCode");String name=candidate.getString("version");
              if(!release.getString("tag_name").equals("android-v"+name)||!name.matches("\\d+\\.\\d+\\.\\d+")||!candidate.getString("sha256").matches("[a-f0-9]{64}"))throw new IOException("Invalid Android update manifest.");
              String apk=candidate.getString("apk");
              if(!apk.equals("Hasimio-"+name+"-android-arm64.apk"))throw new IOException("Invalid APK name.");
              if(code>best){best=code;manifest=candidate;}
            }
          }
          if(releases.length()<30)break;
        }
        checked=System.currentTimeMillis();
        if(manifest==null){set("latest",null,null,0);return;}
        version=manifest.getString("version");set("downloading",version,null,0);
        File directory=new File(activity.getCacheDir(),"updates");directory.mkdirs();
        File partial=new File(directory,"update.part"),apk=new File(directory,"update.apk");
        String url=REPO+"/releases/download/android-v"+version+"/"+manifest.getString("apk");
        MessageDigest hash=MessageDigest.getInstance("SHA-256");
        HttpURLConnection connection=open(url);
        try(InputStream input=connection.getInputStream();OutputStream output=new FileOutputStream(partial)){
          long expected=connection.getContentLengthLong(),total=0;int previous=-1;
          byte[] buffer=new byte[65536];int count;
          while((count=input.read(buffer))!=-1){
            total+=count;if(total>256L*1024*1024)throw new IOException("APK exceeds the download limit.");
            hash.update(buffer,0,count);output.write(buffer,0,count);
            int percent=expected>0?(int)Math.min(99,total*100/expected):0;
            if(percent!=previous){set("downloading",version,null,percent);previous=percent;}
          }
          if(expected>0&&total!=expected)throw new IOException("APK download was interrupted.");
        }finally{connection.disconnect();}
        StringBuilder hex=new StringBuilder();for(byte b:hash.digest())hex.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
        if(!hex.toString().equals(manifest.getString("sha256")))throw new IOException("APK checksum does not match GitHub.");
        verify(partial,best,version);
        if(apk.exists()&&!apk.delete())throw new IOException("Cannot replace the previous update.");
        if(!partial.renameTo(apk))throw new IOException("Cannot save the update.");
        downloaded=apk;set("ready",version,null,100);
      }catch(Exception error){new File(activity.getCacheDir(),"updates/update.part").delete();set("error",version,error.getMessage(),0);}
      finally{synchronized(this){busy=false;}}
    });
  }
  private void verify(File file,int expectedCode,String expectedVersion)throws Exception{
    PackageManager manager=activity.getPackageManager();
    PackageInfo incoming=manager.getPackageArchiveInfo(file.getAbsolutePath(),PackageManager.GET_SIGNING_CERTIFICATES);
    PackageInfo installed=manager.getPackageInfo(activity.getPackageName(),PackageManager.GET_SIGNING_CERTIFICATES);
    if(incoming==null||!activity.getPackageName().equals(incoming.packageName)||incoming.getLongVersionCode()!=expectedCode||incoming.getLongVersionCode()<=installed.getLongVersionCode()||!expectedVersion.equals(incoming.versionName))throw new IOException("APK package or version does not match this app.");
    if(incoming.signingInfo==null||installed.signingInfo==null)throw new IOException("APK signature is missing.");
    Signature[] a=incoming.signingInfo.getApkContentsSigners(),b=installed.signingInfo.getApkContentsSigners();
    if(a.length!=b.length||a.length!=1||!Arrays.equals(a[0].toByteArray(),b[0].toByteArray()))throw new IOException("APK is signed by a different publisher.");
  }
  void periodic(){if(System.currentTimeMillis()-checked>6*60*60*1000L)check();}
  void install(){
    if(downloaded==null||!downloaded.isFile())return;
    new AlertDialog.Builder(activity).setTitle("Update Hasimio").setMessage("Android will ask you to confirm installation. Your library and settings will be kept.").setNegativeButton("Cancel",null).setPositiveButton("Continue",(dialog,which)->{
      try{
        if(!activity.getPackageManager().canRequestPackageInstalls()){
          activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));
          set("ready",state.optString("version"),"Allow updates from Hasimio, then tap Install update again.",100);return;
        }
        Uri uri=Uri.parse("content://app.hasimio.android.updates/update.apk");
        activity.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
      }catch(Exception error){set("error",state.optString("version"),error.getMessage(),0);}
    }).show();
  }
  void close(){worker.shutdownNow();}
  private static void requireReleaseUrl(String url)throws IOException{
    if(!url.startsWith(REPO+"/releases/download/android-v"))throw new IOException("Unexpected GitHub release URL.");
  }
  private static HttpURLConnection open(String text)throws IOException{
    for(int redirects=0;redirects<6;redirects++){
      URL url=new URL(text);String host=url.getHost();
      if(!"https".equals(url.getProtocol())||!(host.equals("api.github.com")||host.equals("github.com")||host.equals("release-assets.githubusercontent.com")||host.equals("objects.githubusercontent.com")))throw new IOException("Unexpected update download host.");
      HttpURLConnection connection=(HttpURLConnection)url.openConnection();connection.setConnectTimeout(20000);connection.setReadTimeout(45000);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("User-Agent","Hasimio-Android/"+BuildConfig.VERSION_NAME);
      int code=connection.getResponseCode();
      if(code>=300&&code<400){String location=connection.getHeaderField("Location");connection.disconnect();if(location==null)throw new IOException("Missing redirect URL.");text=new URL(url,location).toString();continue;}
      if(code!=200){connection.disconnect();throw new IOException("GitHub returned HTTP "+code+". Try again later.");}
      return connection;
    }
    throw new IOException("Too many GitHub redirects.");
  }
  private static byte[] bytes(String url,int limit)throws IOException{
    HttpURLConnection connection=open(url);
    try(InputStream input=connection.getInputStream();ByteArrayOutputStream output=new ByteArrayOutputStream()){
      byte[] buffer=new byte[8192];int count,total=0;while((count=input.read(buffer))!=-1){total+=count;if(total>limit)throw new IOException("GitHub response exceeds the limit.");output.write(buffer,0,count);}return output.toByteArray();
    }finally{connection.disconnect();}
  }
}
