import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Colors } from '@/shared/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';

// Tracks the last non-profile route the user visited so the avatar toggle can
// return there. Drawer screens are sibling routes, not a stack, so router.back()
// would just unwind to the initial screen (dashboard).
let lastParentRoute: string = '/(parent)/dashboard';

/**
 * Custom Drawer Content
 * Matches the website's sidebar with profile and navigation
 */
function CustomDrawerContent(props: any) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <DrawerContentScrollView {...props}>
        {/* User Profile Header - Now Clickable */}
        <TouchableOpacity 
          activeOpacity={0.7} 
          onPress={() => router.push('/(parent)/profile')}
          style={styles.userProfile}
        >
          <View style={styles.avatarBox}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'U'}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>{user?.name || 'User'}</Text>
            <Text style={styles.userRole}>PARENT</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Navigation Items */}
        <DrawerItemList {...props} />
      </DrawerContentScrollView>

      {/* Logout at Bottom */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color={Colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function HeaderAvatar() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const onProfile = pathname?.endsWith('/profile');

  // Remember the last non-profile route so the toggle can restore it.
  useEffect(() => {
    if (pathname && !pathname.endsWith('/profile')) {
      lastParentRoute = pathname;
    }
  }, [pathname]);

  const handlePress = () => {
    if (onProfile) {
      router.replace(lastParentRoute as any);
    } else {
      router.push('/(parent)/profile');
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={styles.headerAvatar}
      activeOpacity={0.7}
    >
      <View style={styles.headerAvatarInner}>
        <Text style={styles.headerAvatarText}>{user?.name?.charAt(0) || 'U'}</Text>
      </View>
      <View style={styles.headerOnlineStatus} />
    </TouchableOpacity>
  );
}

export default function DrawerLayout() {
  return (
    <Drawer
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: true,
        headerRight: () => <HeaderAvatar />,
        headerStyle: {
          backgroundColor: Colors.background,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
        },
        headerTintColor: Colors.text,
        headerTitleStyle: {
          fontWeight: '800',
          fontSize: 18,
          letterSpacing: -0.5,
        },
        drawerStyle: {
          backgroundColor: Colors.background,
          width: 280,
        },
        drawerActiveTintColor: Colors.primary,
        drawerInactiveTintColor: Colors.textMuted,
        drawerLabelStyle: {
          fontWeight: '700',
          marginLeft: -10,
        },
        drawerItemStyle: {
          borderRadius: 12,
          paddingHorizontal: 10,
          marginVertical: 4,
        },
      }}
    >
      {/* Drawer order mirrors the centralized web sidebar config in
          frontend/src/lib/navigation.ts → parentNavItems. */}
      <Drawer.Screen
        name="dashboard"
        options={{
          drawerLabel: 'Dashboard',
          title: 'Overview',
          drawerIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="marks"
        options={{
          drawerLabel: 'Academics',
          title: 'My Marks',
          drawerIcon: ({ color, size }) => <Ionicons name="medal-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="attendance"
        options={{
          drawerLabel: 'Attendance',
          title: 'Attendance',
          drawerIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="timetable"
        options={{
          drawerLabel: 'Timetable',
          title: 'Class Schedule',
          drawerIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="announcements"
        options={{
          drawerLabel: 'Announcements',
          title: 'School News',
          drawerIcon: ({ color, size }) => <Ionicons name="megaphone-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="teachers"
        options={{
          drawerLabel: 'Teachers',
          title: 'Faculty',
          drawerIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="events"
        options={{
          drawerLabel: 'Events',
          title: 'Calendar',
          drawerIcon: ({ color, size }) => <Ionicons name="sparkles-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="bus-tracking"
        options={{
          drawerLabel: 'Bus Tracking',
          title: 'Bus Tracking',
          drawerIcon: ({ color, size }) => <Ionicons name="bus-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="fees"
        options={{
          drawerLabel: 'Payment',
          title: 'Financials',
          drawerIcon: ({ color, size }) => <Ionicons name="card-outline" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="profile"
        options={{
          drawerLabel: 'Settings',
          title: 'Profile',
          drawerItemStyle: { display: 'none' },
          drawerIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  userProfile: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginTop: 10,
  },
  avatarBox: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: '900',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  userRole: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 20,
    marginVertical: 10,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingBottom: 40,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  logoutText: {
    color: Colors.danger,
    fontSize: 16,
    fontWeight: '700',
  },
  headerAvatar: {
    marginRight: 16,
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.white,
    padding: 1.5,
    shadowColor: Colors.primary,
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
    color: Colors.primary,
  },
  headerOnlineStatus: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.background,
  },
});
