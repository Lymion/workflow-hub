// A button that shrinks slightly while pressed (Reanimated). Feels responsive on every tap.
import { Pressable, Text, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

const APressable = Animated.createAnimatedComponent(Pressable);

export function ScaleButton({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <APressable
      onPressIn={() => (scale.value = withSpring(0.96, { damping: 20, stiffness: 400 }))} // CHANGE: 0.95–0.98
      onPressOut={() => (scale.value = withSpring(1, { damping: 20, stiffness: 400 }))}
      onPress={onPress}
      style={[styles.btn, style]}
      accessibilityRole="button"
    >
      <Text style={styles.label}>{label}</Text>
    </APressable>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: "#0071E3", paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, alignItems: "center" }, // CHANGE: theme colour
  label: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
