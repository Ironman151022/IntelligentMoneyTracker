import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { HomeScreen } from '../screens/HomeScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { GraphScreen } from '../screens/GraphScreen';
import { Colors, Radius, Spacing, Typography } from '../theme';

const Tab = createBottomTabNavigator();

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_CONFIG: Record<string, { icon: IoniconsName; activeIcon: IoniconsName; label: string }> = {
  Home: { icon: 'home-outline', activeIcon: 'home', label: 'Home' },
  History: { icon: 'list-outline', activeIcon: 'list', label: 'History' },
  Graph: { icon: 'git-network-outline', activeIcon: 'git-network', label: 'Graph' },
};

function TabBarIcon({ name, focused }: { name: string; focused: boolean }) {
  const cfg = TAB_CONFIG[name];
  const iconName = focused ? cfg.activeIcon : cfg.icon;
  const color = focused ? Colors.accent : Colors.textMuted;

  return (
    <View style={[styles.iconWrapper, focused && styles.iconWrapperActive]}>
      <Ionicons name={iconName} size={22} color={color} />
    </View>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarBackground: () => (
            <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
          ),
          tabBarShowLabel: true,
          tabBarActiveTintColor: Colors.accent,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarLabelStyle: styles.tabLabel,
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name={route.name} focused={focused} />
          ),
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="History" component={HistoryScreen} />
        <Tab.Screen name="Graph" component={GraphScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 0.5,
    borderTopColor: Colors.glassBorder,
    backgroundColor: 'transparent',
    elevation: 0,
    height: 78,
    paddingBottom: 18,
  },
  iconWrapper: {
    width: 40,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
  },
  iconWrapperActive: {
    backgroundColor: Colors.accentSoft,
  },
  tabLabel: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: '600',
  },
});
