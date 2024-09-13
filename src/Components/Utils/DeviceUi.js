import { MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * Gets the appropriate manufacturer icon based on device name.
 * @param {string} name - The name of the Bluetooth device.
 * @returns {string} - The icon name for the device.
 */
export const getManufacturerIcon = (name) => {
  if (!name) return "bluetooth-off"; // Icon for unknown devices

  // Specific Bluetooth Device Icons
  if (name.includes("Speaker")) {
    return "speaker-bluetooth";
  } else if (
    name.includes("Headphone") ||
    name.includes("Earbud") ||
    name.includes("AirPods")
  ) {
    return "headphones-bluetooth";
  } else if (name.includes("Keyboard")) {
    return "keyboard-bluetooth";
  } else if (name.includes("Mouse")) {
    return "mouse-bluetooth";
  } else if (name.includes("Phone") || name.includes("iPhone")) {
    return "cellphone";
  } else if (name.includes("Watch")) {
    return "watch";

    // TV Brands
  } else if (name.includes("Samsung")) {
    return "television";
  } else if (name.includes("LG")) {
    return "television-classic";
  } else if (name.includes("Sony")) {
    return "television";

    // iOS Devices
  } else if (name.includes("iPad")) {
    return "tablet-ipad";
  } else if (name.includes("MacBook")) {
    return "laptop-mac";

    // Default Bluetooth Icon for general Bluetooth devices
  } else if (name.includes("Bluetooth")) {
    return "bluetooth"; // General Bluetooth icon
  }

  // Default for unknown or unclassified devices
  return "bluetooth-connect";
};

/**
 * Gets the color based on RSSI value.
 * @param {number} rssi - The RSSI value.
 * @returns {string} - The color representing the signal strength.
 */
export const getRssiColor = (rssi) => {
  if (rssi >= -50) {
    return "green"; // Strong signal
  } else if (rssi >= -75) {
    return "orange"; // Medium signal
  } else {
    return "red"; // Weak signal
  }
};

/**
 * Gets the icon based on RSSI value.
 * @param {number} rssi - The RSSI value.
 * @returns {string} - The icon name representing the signal strength.
 */
export const getRssiIcon = (rssi) => {
  if (rssi >= -50) {
    return "signal-cellular-3"; // Strong signal icon
  } else if (rssi >= -75) {
    return "signal-cellular-2"; // Medium signal icon
  } else {
    return "signal-cellular-1"; // Weak signal icon
  }
};
