// Camera start/capture. Only cameraErrorMessage is pure; the rest need a browser.
export async function startCamera(video, mediaDevices = globalThis.navigator?.mediaDevices) {
  if (!mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('getUserMedia unavailable'), { name: 'NotSupportedError' });
  }
  const stream = await mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 4096 } },
  });
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was denied. Allow camera access for this site in Chrome settings, then reload.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No suitable camera was found on this device.';
    case 'NotReadableError':
      return 'The camera is being used by another app. Close it, then reload.';
    case 'NotSupportedError':
      return 'This browser cannot use the camera here. Open the app over https in Chrome.';
    default:
      return `The camera failed to start (${err?.name || 'unknown error'}).`;
  }
}

export function captureFrame(video) {
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0);
  return c;
}

export function frameToJpeg(canvas, maxWidth = 1080, quality = 0.8) {
  const scale = Math.min(1, maxWidth / canvas.width);
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * scale);
  c.height = Math.round(canvas.height * scale);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });
}
