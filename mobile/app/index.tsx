import { Redirect } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { LoadingScreen } from '../components/ui/Feedback';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen message="Starting EduTrack..." />;
  if (isAuthenticated) return <Redirect href="/dashboard" />;
  return <Redirect href="/login" />;
}
