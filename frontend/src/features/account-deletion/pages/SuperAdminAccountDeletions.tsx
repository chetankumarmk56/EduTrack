import { motion } from 'framer-motion';
import DeletionRequestsPanel from '../components/DeletionRequestsPanel';

export default function SuperAdminAccountDeletions() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Administrator Deletion Requests
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Review and approve account-deletion requests submitted by school administrators. Approving
          deactivates the administrator account immediately and revokes access.
        </p>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <DeletionRequestsPanel />
      </motion.div>
    </div>
  );
}
