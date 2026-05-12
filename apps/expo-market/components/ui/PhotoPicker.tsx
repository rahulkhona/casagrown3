/**
 * PhotoPicker — shared component for all image-picking across expo-market.
 *
 * Handles:
 *  - requestCameraPermissionsAsync / requestMediaLibraryPermissionsAsync
 *  - Alert on denial
 *  - Optional ImageManipulator resize/compress
 *  - Single or multiple selection
 *
 * Usage:
 *   <PhotoPicker
 *     source="library"          // 'camera' | 'library'
 *     multiple                  // optional, default false
 *     maxCount={5}              // optional
 *     resizeWidth={1200}        // optional — skips manipulator if omitted
 *     onPick={(uris) => ...}
 *   >
 *     <Pressable>...</Pressable>
 *   </PhotoPicker>
 *
 * Or use the imperative helpers directly:
 *   import { pickFromLibrary, pickFromCamera } from '@/components/ui/PhotoPicker'
 */

import React from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export interface PhotoPickerOptions {
  source: 'camera' | 'library';
  multiple?: boolean;
  maxCount?: number;
  resizeWidth?: number;
  quality?: number;
  /** Native crop: true enables the system crop UI after selection */
  allowsEditing?: boolean;
  /**
   * Crop aspect ratio [width, height].
   * Use [1, 1] for avatars (matches next-market cropSquare).
   * Use [35, 10] for booth banners (matches next-market cropGuide:'banner' ~3.5:1).
   */
  aspect?: [number, number];
  /**
   * If true, returns data:mime;base64,... strings instead of file:// URIs.
   * Use this when you need to send the image to an API (e.g. AI analysis).
   * Matches next-market's FileReader.readAsDataURL behaviour.
   */
  base64AsDataUrl?: boolean;
}

async function requestPermission(source: 'camera' | 'library'): Promise<boolean> {
  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required. Please enable it in Settings.');
      return false;
    }
  } else {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required. Please enable it in Settings.');
      return false;
    }
  }
  return true;
}

async function processUri(uri: string, resizeWidth?: number, quality = 0.8): Promise<string> {
  if (!resizeWidth) return uri;
  const m = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: resizeWidth } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
  );
  return m.uri;
}

/** Imperative: pick from library, returns URIs or null on cancel/denial */
export async function pickFromLibrary(opts: Omit<PhotoPickerOptions, 'source'> = {}): Promise<string[] | null> {
  const { multiple = false, maxCount = 5, resizeWidth, quality = 0.8, allowsEditing = false, aspect, base64AsDataUrl = false } = opts;
  if (!(await requestPermission('library'))) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? maxCount : 1,
    allowsEditing: !multiple && allowsEditing,
    aspect,
    quality,
    base64: base64AsDataUrl,
  });

  if (result.canceled) return null;

  if (base64AsDataUrl) {
    // Resize first (if resizeWidth set), then encode as base64 via ImageManipulator
    // This keeps the payload small enough for edge function body limits (~6MB)
    return Promise.all(result.assets.map(async a => {
      const targetWidth = resizeWidth ?? 800; // default 800px for AI payloads
      const m = await ImageManipulator.manipulateAsync(
        a.uri,
        [{ resize: { width: targetWidth } }],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      return `data:image/jpeg;base64,${m.base64}`;
    }));
  }

  return Promise.all(result.assets.map(a => processUri(a.uri, resizeWidth, quality)));
}

/** Imperative: pick from camera, returns URIs or null on cancel/denial */
export async function pickFromCamera(opts: Omit<PhotoPickerOptions, 'source'> = {}): Promise<string[] | null> {
  const { resizeWidth, quality = 0.8, allowsEditing = false, aspect } = opts;
  if (!(await requestPermission('camera'))) return null;

  try {
    const result = await ImagePicker.launchCameraAsync({ quality, allowsEditing, aspect });
    if (result.canceled) return null;
    return Promise.all(result.assets.map(a => processUri(a.uri, resizeWidth, quality)));
  } catch (e: any) {
    // iOS Simulator has no camera — fall back to library
    Alert.alert('Camera unavailable', 'No camera detected. Please use the Upload option instead.');
    return null;
  }
}

/** Convenience: pick from either source */
export async function pickPhotos(opts: PhotoPickerOptions): Promise<string[] | null> {
  return opts.source === 'camera' ? pickFromCamera(opts) : pickFromLibrary(opts);
}
