package app.hasimio.android;

import android.app.*;
import android.os.*;
import android.webkit.*;
import android.view.*;
import android.widget.TextView;
import android.content.*;
import android.net.Uri;
import java.io.*;
import java.net.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

public class MainActivity extends Activity {
  static { System.loadLibrary("node"); System.loadLibrary("hasimio"); }
  private static native int startNode(String[] args);
  private static final AtomicBoolean started=new AtomicBoolean();
  private static volatile String engineError;
  static final String ORIGIN="http://127.0.0.1:11476";
  WebView web;
  private Updates updates;
  private View fullscreen;
  private WebChromeClient.CustomViewCallback fullscreenCallback;
  private ValueCallback<Uri[]> filePicker;
  private boolean destroyed;

  @Override public void onCreate(Bundle state){
    super.onCreate(state);
    getWindow().setStatusBarColor(0xff101014);getWindow().setNavigationBarColor(0xff101014);
    TextView loading=new TextView(this);loading.setText("Starting Hasimio…");loading.setGravity(Gravity.CENTER);setContentView(loading);
    updates=new Updates(this);
    if(started.compareAndSet(false,true))new Thread(()->{
      try{
        File engine=new File(getFilesDir(),"engine-"+BuildConfig.VERSION_NAME);
        copyAssets("engine",engine);
        File data=new File(getFilesDir(),"data");data.mkdirs();
        String script="process.env.HASIMIO_MOBILE_DATA="+JSONObject.quote(data.getAbsolutePath())+";require("+JSONObject.quote(new File(engine,"engine.cjs").getAbsolutePath())+");";
        int code=startNode(new String[]{"node","-e",script});
        engineError="The on-device engine stopped ("+code+"). Close Hasimio and reopen it.";
      }catch(Throwable error){engineError="Could not start the on-device engine: "+error.getMessage();}
    },"Hasimio Engine").start();
    new Thread(()->{
      for(int attempt=0;attempt<120&&!destroyed;attempt++){
        if(engineError!=null)break;
        try{
          HttpURLConnection connection=(HttpURLConnection)new URL(ORIGIN+"/api/streaming/health").openConnection();
          connection.setConnectTimeout(500);connection.setReadTimeout(500);
          try{if(connection.getResponseCode()==200){runOnUiThread(this::openApp);return;}}finally{connection.disconnect();}
        }catch(IOException ignored){}
        try{Thread.sleep(250);}catch(InterruptedException ignored){return;}
      }
      runOnUiThread(()->loading.setText(engineError==null?"The on-device engine did not start. Close Hasimio and reopen it.":engineError));
    },"Hasimio startup").start();
  }

  private void copyAssets(String source,File target)throws IOException{
    String[] children=getAssets().list(source);
    if(children!=null&&children.length>0){target.mkdirs();for(String child:children)copyAssets(source+"/"+child,new File(target,child));}
    else{target.getParentFile().mkdirs();try(InputStream input=getAssets().open(source);OutputStream output=new FileOutputStream(target)){byte[] buffer=new byte[65536];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);}}
  }
  @SuppressWarnings("SetJavaScriptEnabled") private void openApp(){
    if(destroyed)return;
    web=new WebView(this);
    WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);
    settings.setMediaPlaybackRequiresUserGesture(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    web.addJavascriptInterface(new Object(){
      @JavascriptInterface public String state(){return updates.state();}
      @JavascriptInterface public void check(){updates.check();}
      @JavascriptInterface public void install(){runOnUiThread(()->updates.install());}
    },"HasimioAndroid");
    web.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
        if(request.getUrl().toString().startsWith(ORIGIN+"/"))return false;
        String scheme=request.getUrl().getScheme();
        if(request.isForMainFrame()&&("https".equals(scheme)||"http".equals(scheme)))try{startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl()));}catch(ActivityNotFoundException ignored){}
        return true;
      }
    });
    web.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
        if(filePicker!=null)filePicker.onReceiveValue(null);
        filePicker=callback;
        try{startActivityForResult(params.createIntent(),100);return true;}
        catch(ActivityNotFoundException error){filePicker=null;return false;}
      }
      @Override public void onShowCustomView(View view,CustomViewCallback callback){fullscreen=view;fullscreenCallback=callback;setContentView(view);getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);}
      @Override public void onHideCustomView(){if(fullscreen!=null){setContentView(web);fullscreen=null;getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);fullscreenCallback.onCustomViewHidden();}}
    });
    setContentView(web);web.loadUrl(ORIGIN+"/");
    web.postDelayed(()->updates.check(),10000);
  }
  void emit(String json){runOnUiThread(()->{if(web!=null&&!destroyed)web.evaluateJavascript("window.hasimioAndroidUpdate?.("+json+")",null);});}
  @Override protected void onActivityResult(int request,int result,Intent data){
    super.onActivityResult(request,result,data);
    if(request==100&&filePicker!=null){filePicker.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));filePicker=null;}
  }
  @Override protected void onResume(){super.onResume();if(web!=null){web.onResume();updates.periodic();}}
  @Override protected void onPause(){if(web!=null){web.evaluateJavascript("document.querySelectorAll('video').forEach(v=>v.pause())",null);web.onPause();}super.onPause();}
  @Override protected void onDestroy(){destroyed=true;if(filePicker!=null)filePicker.onReceiveValue(null);updates.close();if(web!=null){web.removeJavascriptInterface("HasimioAndroid");web.destroy();}super.onDestroy();}
  @Override public void onBackPressed(){
    if(fullscreen!=null){web.getWebChromeClient().onHideCustomView();return;}
    if(web==null){super.onBackPressed();return;}
    web.evaluateJavascript("Boolean(window.hasimioAndroidBack?.())",handled->{if(!"true".equals(handled))new AlertDialog.Builder(this).setMessage("Close Hasimio?").setNegativeButton("Cancel",null).setPositiveButton("Close",(dialog,which)->{
      // One embedded Node runtime per process. End it with the activity so all peers and RAM buffers close.
      finishAndRemoveTask();android.os.Process.killProcess(android.os.Process.myPid());
    }).show();});
  }
}
