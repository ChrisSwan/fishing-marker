import { test, assertTrue } from './runner.js';
import { cameraErrorMessage } from '../js/camera.js';

const err = (name) => Object.assign(new Error(name), { name });

test('camera errors map to readable messages', () => {
  assertTrue(cameraErrorMessage(err('NotAllowedError')).includes('permission'));
  assertTrue(cameraErrorMessage(err('NotFoundError')).includes('No suitable camera'));
  assertTrue(cameraErrorMessage(err('NotReadableError')).includes('another app'));
  assertTrue(cameraErrorMessage(err('NotSupportedError')).includes('https'));
  assertTrue(cameraErrorMessage(err('WeirdError')).includes('WeirdError'));
  assertTrue(cameraErrorMessage(undefined).includes('unknown'));
});
