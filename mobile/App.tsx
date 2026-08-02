import 'react-native-gesture-handler'; // must be first import
import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation';
import { GestureLayer } from './src/components/GestureLayer';
import { ModelSetupScreen } from './src/screens/ModelSetupScreen';

export default function App() {
  const [modelReady, setModelReady] = useState(false);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!modelReady ? (
        <ModelSetupScreen onReady={() => setModelReady(true)} />
      ) : (
        <GestureLayer>
          <AppNavigator />
        </GestureLayer>
      )}
    </SafeAreaProvider>
  );
}
