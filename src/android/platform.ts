export const isAndroid=import.meta.env.VITE_ANDROID==='true';
export const isAndroidArm32=import.meta.env.VITE_ANDROID_ARM32==='true';
export const isAndroidTV=isAndroid&&document.documentElement.classList.contains('hasimio-android-tv');
export const androidHlsLimits={maxBufferLength:15,maxMaxBufferLength:20,maxBufferSize:16*1024*1024,backBufferLength:0,capLevelToPlayerSize:true,capLevelOnFPSDrop:true};
