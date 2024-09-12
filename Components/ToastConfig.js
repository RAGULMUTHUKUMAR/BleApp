import React from "react";
import { View, Text, StyleSheet } from "react-native";
import ErrorIcon from "react-native-vector-icons/MaterialIcons";
import InfoIcon from "react-native-vector-icons/Entypo";
import Like1Icon from "react-native-vector-icons/AntDesign";

const toastConfig = {
  success: (internalToast) => (
    <View style={[styles.toastContainer, styles.successToast]}>
      <Like1Icon name="like1" size={20} color="#28a745" />
      <View style={styles.textContainer}>
        <Text style={styles.toastTitle}>{internalToast.text1}</Text>
        <Text style={styles.toastMessage}>{internalToast.text2}</Text>
      </View>
    </View>
  ),
  error: (internalToast) => (
    <View style={[styles.toastContainer, styles.errorToast]}>
      <ErrorIcon name="error" size={20} color="#dc3545" />
      <View style={styles.textContainer}>
        <Text style={styles.toastTitle}>{internalToast.text1}</Text>
        <Text style={styles.toastMessage}>{internalToast.text2}</Text>
      </View>
    </View>
  ),
  info: (internalToast) => (
    <View style={[styles.toastContainer, styles.infoToast]}>
      <InfoIcon name="info" size={20} color="#17a2b8" />
      <View style={styles.textContainer}>
        <Text style={styles.toastTitle}>{internalToast.text1}</Text>
        <Text style={styles.toastMessage}>{internalToast.text2}</Text>
      </View>
    </View>
  ),
};

const styles = StyleSheet.create({
  toastContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    elevation: 5,
    maxWidth: "85%", // Ensure toast does not overflow screen
  },
  textContainer: {
    marginLeft: 10,
    flex: 1,
  },
  toastTitle: {
    fontSize: 14, // Adjusted for better readability
    fontWeight: "bold",
    color: "#000",
  },
  toastMessage: {
    fontSize: 12,
    color: "#000",
  },
  successToast: {
    backgroundColor: "#f8f9fa",
  },
  errorToast: {
    backgroundColor: "#f8f9fa",
  },
  infoToast: {
    backgroundColor: "#f8f9fa",
  },
});

export default toastConfig;
