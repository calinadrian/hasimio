package app.hasimio.android;

import android.app.*;
import android.os.*;
import android.webkit.*;
import android.view.*;
import android.widget.*;
import android.content.*;
import android.net.Uri;
import java.io.*;
import java.net.*;

public class MainActivity extends Activity {
  static final String ORIGIN="http://127.0.0.1:11476";
  WebView web;
  private Updates updates;
  private FrameLayout appView;
  private View fullscreen;
  private WebChromeClient.CustomViewCallback fullscreenCallback;
  private ValueCallback<Uri[]> filePicker;
  private volatile boolean destroyed;
  private volatile boolean engineFailed;
  private boolean bound;
  private final ServiceConnection engineConnection=new ServiceConnection(){
    @Override public void onServiceConnected(ComponentName name,IBinder binder){}
    @Override public void onServiceDisconnected(ComponentName name){
      if(destroyed)return;
      engineFailed=true;
      if(bound){unbindService(this);bound=false;}
      showStartupError("The native engine process stopped unexpectedly.");
    }
  };

  @Override public void onCreate(Bundle state){
    super.onCreate(state);
    getWindow().setStatusBarColor(0xff101014);getWindow().setNavigationBarColor(0xff101014);
    TextView loading=new TextView(this);loading.setText("Starting Hasimio…");loading.setGravity(Gravity.CENTER);setContentView(loading);
    updates=new Updates(this);
    new File(getFilesDir(),"engine-startup-error.txt").delete();
    bound=bindService(new Intent(this,EngineService.class),engineConnection,BIND_AUTO_CREATE);
    if(!bound){showStartupError("Android could not start the engine service.");return;}
    new Thread(()->{
      for(int attempt=0;attempt<120&&!destroyed&&!engineFailed;attempt++){
        if(new File(getFilesDir(),"engine-startup-error.txt").exists())break;
        try{
          HttpURLConnection connection=(HttpURLConnection)new URL(ORIGIN+"/api/streaming/health").openConnection();
          connection.setConnectTimeout(500);connection.setReadTimeout(500);
          try{if(connection.getResponseCode()==200){runOnUiThread(this::openApp);return;}}finally{connection.disconnect();}
        }catch(IOException ignored){}
        try{Thread.sleep(250);}catch(InterruptedException ignored){return;}
      }
      runOnUiThread(()->showStartupError("The on-device engine did not start."));
    },"Hasimio startup").start();
  }

  private String readReport(String name){
    try(InputStream input=new FileInputStream(new File(getFilesDir(),name));ByteArrayOutputStream output=new ByteArrayOutputStream()){
      byte[] buffer=new byte[4096];int count;while(output.size()<32768&&(count=input.read(buffer))!=-1)output.write(buffer,0,Math.min(count,32768-output.size()));
      return new String(output.toByteArray(),java.nio.charset.StandardCharsets.UTF_8);
    }catch(IOException ignored){return "";}
  }
  private void showStartupError(String reason){
    if(destroyed)return;
    engineFailed=true;
    String system="";
    if(Build.VERSION.SDK_INT>=30){
      ActivityManager manager=(ActivityManager)getSystemService(ACTIVITY_SERVICE);
      for(ApplicationExitInfo exit:manager.getHistoricalProcessExitReasons(getPackageName(),0,8)){
        if((getPackageName()+":engine").equals(exit.getProcessName())){system="\nEngine exit reason "+exit.getReason()+", status "+exit.getStatus()+": "+exit.getDescription();break;}
      }
    }
    String report="Hasimio "+BuildConfig.VERSION_NAME+"\nAndroid "+Build.VERSION.RELEASE+" / "+Build.MANUFACTURER+" "+Build.MODEL+"\nMemory page size: "+android.system.Os.sysconf(android.system.OsConstants._SC_PAGESIZE)+" bytes\n"+reason+system+"\n\n"+readReport("engine-startup-error.txt")+"\n"+readReport("engine-native.log");
    android.util.Log.e("HasimioStartup",report);
    LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setPadding(32,32,32,32);
    TextView title=new TextView(this);title.setText("Hasimio could not start");title.setTextSize(22);layout.addView(title);
    ScrollView scroll=new ScrollView(this);TextView detail=new TextView(this);detail.setText(report);detail.setTextIsSelectable(true);scroll.addView(detail);layout.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
    Button copy=new Button(this);copy.setText("Copy startup report");copy.setOnClickListener(v->{((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Hasimio startup report",report));Toast.makeText(this,"Startup report copied",Toast.LENGTH_SHORT).show();});layout.addView(copy);
    setContentView(layout);
  }
  @SuppressWarnings("SetJavaScriptEnabled") private void openApp(){
    if(destroyed||engineFailed)return;
    web=new WebView(this);
    appView=new FrameLayout(this);
    appView.addView(web,new FrameLayout.LayoutParams(-1,-1));
    final boolean television=getPackageManager().hasSystemFeature(android.content.pm.PackageManager.FEATURE_LEANBACK)
      ||((UiModeManager)getSystemService(UI_MODE_SERVICE)).getCurrentModeType()==android.content.res.Configuration.UI_MODE_TYPE_TELEVISION;
    WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);
    settings.setMediaPlaybackRequiresUserGesture(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    web.addJavascriptInterface(new Object(){
      @JavascriptInterface public boolean isTelevision(){return television;}
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
      @Override public void onShowCustomView(View view,CustomViewCallback callback){
        if(fullscreen!=null){callback.onCustomViewHidden();return;}
        fullscreen=view;fullscreenCallback=callback;
        appView.addView(view,new FrameLayout.LayoutParams(-1,-1));
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        appView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        view.requestFocus();
      }
      @Override public void onHideCustomView(){
        if(fullscreen==null)return;
        appView.removeView(fullscreen);fullscreen=null;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        appView.setSystemUiVisibility(0);
        WebChromeClient.CustomViewCallback callback=fullscreenCallback;fullscreenCallback=null;
        callback.onCustomViewHidden();
        web.requestFocus();
      }
    });
    setContentView(appView);web.loadUrl(ORIGIN+"/");
    web.postDelayed(()->updates.check(),10000);
  }
  void emit(String json){runOnUiThread(()->{if(web!=null&&!destroyed)web.evaluateJavascript("window.hasimioAndroidUpdate?.("+json+")",null);});}
  @Override protected void onActivityResult(int request,int result,Intent data){
    super.onActivityResult(request,result,data);
    if(request==100&&filePicker!=null){filePicker.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));filePicker=null;}
  }
  @Override protected void onResume(){super.onResume();if(web!=null){web.onResume();updates.periodic();}}
  @Override protected void onPause(){if(web!=null){web.evaluateJavascript("document.querySelectorAll('video').forEach(v=>v.pause())",null);web.onPause();}super.onPause();}
  @Override protected void onDestroy(){destroyed=true;if(bound){unbindService(engineConnection);bound=false;}if(filePicker!=null)filePicker.onReceiveValue(null);updates.close();if(web!=null){appView.removeAllViews();web.removeJavascriptInterface("HasimioAndroid");web.destroy();}super.onDestroy();}
  @Override public void onBackPressed(){
    if(fullscreen!=null){web.getWebChromeClient().onHideCustomView();return;}
    if(web==null){super.onBackPressed();return;}
    web.evaluateJavascript("Boolean(window.hasimioAndroidBack?.())",handled->{if(!"true".equals(handled))new AlertDialog.Builder(this).setMessage("Close Hasimio?").setNegativeButton("Cancel",null).setPositiveButton("Close",(dialog,which)->{
      // One embedded Node runtime per process. End it with the activity so all peers and RAM buffers close.
      finishAndRemoveTask();android.os.Process.killProcess(android.os.Process.myPid());
    }).show();});
  }
}
