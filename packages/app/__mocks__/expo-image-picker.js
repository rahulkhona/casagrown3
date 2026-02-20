// Mock for expo-image-picker — used in create-post / OfferSheet tests
module.exports = {
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: true,
    assets: [],
  }),
  launchCameraAsync: jest.fn().mockResolvedValue({
    canceled: true,
    assets: [],
  }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  }),
  MediaTypeOptions: {
    All: 'All',
    Images: 'Images',
    Videos: 'Videos',
  },
  VideoExportPreset: {
    Passthrough: 0,
    LowQuality: 1,
    MediumQuality: 2,
    HighestQuality: 3,
  },
  UIImagePickerControllerQualityType: {
    High: 0,
    Medium: 1,
    Low: 2,
  },
};
