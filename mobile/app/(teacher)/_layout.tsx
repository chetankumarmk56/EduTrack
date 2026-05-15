import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Colors } from '@/shared/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

function CustomTeacherDrawerContent(props: any) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <DrawerContentScrollView {...props}>
        <TouchableOpacity 
          activeOpacity={0.7}
          onPress={() => router.push('/(teacher)/profile')}
          style={[styles.userProfile, { borderColor: Colors.success, borderLeftWidth: 4 }]}
        >
          <View style={[styles.avatarBox, { backgroundColor: Colors.success }]}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'T'}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>{user?.name || 'Teacher'}</Text>
            <Text style={[styles.userRole, { color: Colors.success }]}>FACULTY PORTAL</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.divider} />
        <DrawerItemList {...props} />
      </DrawerContentScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color={Colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TeacherHeaderAvatar() {
  const { user } = useAuth();
  const router = useRouter();

  return (
    <TouchableOpacity
      onPress={() => router.push('/(teacher)/profile')}
      style={styles.headerAvatar}
      activeOpacity={0.7}
    >
      <View style={styles.headerAvatarInner}>
        <Text style={styles.headerAvatarText}>{user?.name?.charAt(0) || 'T'}</Text>
      </View>
      <View style={[styles.headerOnlineStatus, { backgroundColor: Colors.success }]} />
    </TouchableOpacity>
  );
}

export default function TeacherLayout() {
  return (
    <Drawer
      drawerContent={(props) => <CustomTeacherDrawerContent {...props} />}
      screenOptions={{
        headerShown: true,
        headerRight: () => <TeacherHeaderAvatar />,
        headerStyle: {
          backgroundColor: Colors.background,
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
        },
        headerTintColor: Colors.text,
        headerTitleStyle: {
          fontWeight: '900',
          fontSize: 20,
          letterSpacing: -1,
        },
        drawerActiveTintColor: Colors.success,
        drawerInactiveTintColor: Colors.textMuted,
        drawerLabelStyle: { fontWeight: '700', marginLeft: -10 },
        drawerItemStyle: { borderRadius: 12, marginVertical: 4, marginHorizontal: 12 },
      }}
    >
      {/* Drawer order mirrors the centralized web sidebar config in
          frontend/src/lib/navigation.ts → teacherNavItems. */}
      <Drawer.Screen
        name="my-attendance"
        options={{
          drawerLabel: 'My Attendance',
          title: 'My Attendance & Leave',
          drawerIcon: ({ color, size }) => <Ionicons name="calendar-number-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="attendance"
        options={{
          drawerLabel: 'Attendance',
          title: 'Take Attendance',
          drawerIcon: ({ color, size }) => <Ionicons name="checkbox-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="marks"
        options={{
          drawerLabel: 'Marks',
          title: 'Mark Entry',
          drawerIcon: ({ color, size }) => <Ionicons name="create-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="timetable"
        options={{
          drawerLabel: 'Timetable',
          title: 'My Schedule',
          drawerIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="announcements"
        options={{
          drawerLabel: 'Announcements',
          title: 'Post Update',
          drawerIcon: ({ color, size }) => <Ionicons name="send-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="contacts"
        options={{
          drawerLabel: 'Contact List',
          title: 'Contacts',
          drawerIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="events"
        options={{
          drawerLabel: 'Events',
          title: 'Calendar',
          drawerIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      {/* Kept as the post-login landing screen but hidden from the drawer
          per the seven-item teacher portal spec. */}
      <Drawer.Screen
        name="dashboard"
        options={{
          drawerLabel: 'Home',
          title: 'Teacher HQ',
          drawerItemStyle: { display: 'none' },
          drawerIcon: ({ color, size }) => <Ionicons name="apps-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="profile"
        options={{
          drawerLabel: 'Profile',
          title: 'My Profile',
          drawerItemStyle: { display: 'none' },
          drawerIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  userProfile: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 15, marginTop: 10, backgroundColor: `${Colors.success}08` },
  avatarBox: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.white, fontSize: 22, fontWeight: '900' },
  userInfo: { flex: 1 },
  userName: { color: Colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  userRole: { fontSize: 10, fontWeight: '900', marginTop: 2, letterSpacing: 1 },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 20, marginVertical: 10 },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: Colors.border, paddingBottom: 40 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  logoutText: { color: Colors.danger, fontSize: 16, fontWeight: '700' },
  headerAvatar: {
    marginRight: 16,
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.white,
    padding: 1.5,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  headerAvatarInner: {
    flex: 1,
    borderRadius: 11,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.success,
  },
  headerOnlineStatus: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.background,
  },
});
