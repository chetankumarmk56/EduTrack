import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useApp } from '@/shared/contexts/AppContext';
import AccountIdentityCard from '@/features/account/components/AccountIdentityCard';
import ChangePasswordCard from '@/features/account/components/ChangePasswordCard';

export default function AdminProfile() {
  const { user } = useAuth();
  const { institutionName } = useApp();

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Account</h1>
        <p className="text-muted-foreground">Manage your administrator profile and credentials</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <AccountIdentityCard
          name={user?.name || 'Administrator'}
          subtitle={(user?.role || '').replace('_', ' ') || 'Administrator'}
          email={(user as { email?: string } | null)?.email}
          institutionName={institutionName}
          Icon={ShieldCheck}
        />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <ChangePasswordCard />
      </motion.div>
    </div>
  );
}
