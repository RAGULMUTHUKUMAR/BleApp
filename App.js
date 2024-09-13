import * as React from "react";
import { Image, View, StyleSheet, TouchableOpacity} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import DeviceScanner from "./src/Components/DeviceScanner";
import DeviceDetails from "./src/Components/DeviceDetail";
import Logo from "./assets/Company Logo.png";
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'; // You can choose a different icon set


const Stack = createStackNavigator();

const App = () => {

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="DeviceScanner"
        screenOptions={({ route, navigation }) => ({
          headerTitle: () => (
            <View style={styles.headerTitleContainer}>
              <Image source={Logo} style={styles.logo} />
            </View>
          ),
          headerTitleAlign: "center",
          headerStyle: {
            backgroundColor: "#ffff",
            elevation: 0,
            shadowOpacity: 0,
          },
          headerTintColor: "#ff6347",
          headerLeft: route.name === "DeviceDetails" ? () => (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => {
                navigation.navigate("DeviceScanner");
              }}
            >
            <View style={styles.headerLeftContent}>
                    <Icon name="bluetooth-off" size={24} color="#008ED3" />
                    {/* <Text style={styles.headerText}>Disconnect</Text> */}
                  </View>
            </TouchableOpacity>
          ) : null,
        })}
      >
        <Stack.Screen name="DeviceScanner" component={DeviceScanner} />
        <Stack.Screen name="DeviceDetails" component={DeviceDetails} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

// Define styles for the header logo
const styles = StyleSheet.create({
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: 100, // Adjust the size of the logo
    height: 40,
    resizeMode: "contain", // Ensure the logo maintains its aspect ratio
  },
  headerButton: {
    padding: 10,
  },
  headerLeftContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    marginLeft: 5,
    fontSize: 10,
    color: "#008ED3", // Match the color to your headerTintColor
  },

});

export default App;
