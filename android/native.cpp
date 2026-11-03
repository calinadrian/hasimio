#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <fcntl.h>
#include <unistd.h>
namespace node { int Start(int argc, char* argv[]); }
extern "C" JNIEXPORT jint JNICALL Java_app_hasimio_android_EngineService_startNode(JNIEnv* env,jclass,jobjectArray input,jstring logFile){
  const char* filename=env->GetStringUTFChars(logFile,nullptr);
  int log=open(filename,O_WRONLY|O_CREAT|O_TRUNC,0600);
  env->ReleaseStringUTFChars(logFile,filename);
  if(log>=0){dup2(log,STDOUT_FILENO);dup2(log,STDERR_FILENO);close(log);}
  int count=env->GetArrayLength(input);
  std::vector<char> buffer;
  std::vector<size_t> offsets;
  for(int i=0;i<count;i++){
    auto value=(jstring)env->GetObjectArrayElement(input,i);
    const char* text=env->GetStringUTFChars(value,nullptr);
    offsets.push_back(buffer.size());
    buffer.insert(buffer.end(),text,text+strlen(text)+1);
    env->ReleaseStringUTFChars(value,text);env->DeleteLocalRef(value);
  }
  std::vector<char*> args;for(auto offset:offsets)args.push_back(buffer.data()+offset);args.push_back(nullptr);
  return node::Start(count,args.data());
}
