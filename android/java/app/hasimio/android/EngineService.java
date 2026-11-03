package app.hasimio.android;

import android.app.Service;
import android.content.Intent;
import android.os.Binder;
import android.os.IBinder;
import java.io.*;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** The activity binds while open. A native engine failure cannot kill its UI. */
public class EngineService extends Service {
  private static native int startNode(String[] args,String logFile);
  private final Binder binder=new Binder();
  @Override public IBinder onBind(Intent intent){return binder;}
  @Override public void onCreate(){
    super.onCreate();
    new File(getFilesDir(),"engine-startup-error.txt").delete();
    new Thread(()->{
      try{
        // Load after entering the guarded startup path, never in the activity's
        // static initializer: linker errors must be visible to the user.
        System.loadLibrary("node");System.loadLibrary("hasimio");
        File engine=new File(getFilesDir(),"engine-"+BuildConfig.VERSION_NAME);
        copyAssets("engine",engine);
        File data=new File(getFilesDir(),"data");data.mkdirs();
        File errorFile=new File(getFilesDir(),"engine-startup-error.txt");
        String script="const fs=require('fs');const report=e=>{const text=String(e?.stack||e);fs.writeFileSync("+JSONObject.quote(errorFile.getAbsolutePath())+",text);console.error(text);};"+
          "process.on('uncaughtException',report);process.env.HASIMIO_MOBILE_DATA="+JSONObject.quote(data.getAbsolutePath())+";"+
          "try{require("+JSONObject.quote(new File(engine,"engine.cjs").getAbsolutePath())+");}catch(e){report(e);}";
        int code=startNode(new String[]{"node","-e",script},new File(getFilesDir(),"engine-native.log").getAbsolutePath());
        if(!errorFile.exists())writeError("The on-device engine exited with code "+code+".");
      }catch(Throwable error){writeError(error.toString());}
    },"Hasimio Engine").start();
  }
  private void writeError(String text){
    try(FileOutputStream output=new FileOutputStream(new File(getFilesDir(),"engine-startup-error.txt"))){output.write(text.getBytes(StandardCharsets.UTF_8));}catch(IOException ignored){}
  }
  private void copyAssets(String source,File target)throws IOException{
    String[] children=getAssets().list(source);
    if(children!=null&&children.length>0){target.mkdirs();for(String child:children)copyAssets(source+"/"+child,new File(target,child));}
    else{target.getParentFile().mkdirs();try(InputStream input=getAssets().open(source);OutputStream output=new FileOutputStream(target)){byte[] buffer=new byte[65536];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);}}
  }
  @Override public void onDestroy(){super.onDestroy();android.os.Process.killProcess(android.os.Process.myPid());}
}
