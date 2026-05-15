import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CloudUpload,
  Search,
  FileText,
  Trash2,
  Download,
  Loader2,
  FolderOpen,
  Filter,
  ArrowDownUp,
  Zap,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatBytes, formatDateTime, formatRelative } from '@/shared/lib/format';
import { StaggerContainer, StaggerItem } from '@/shared/components/ui/PageWrapper';
import { FilePicker } from '@/shared/components/FilePicker/FilePicker';
import {
  uploadedFilesApi,
  type UploadedFile,
} from '@/features/my-files/api';

type SortKey = 'date_desc' | 'date_asc' | 'name_asc' | 'size_desc';

export default function MyFiles() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date_desc');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<UploadedFile | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await uploadedFilesApi.list({ limit: 200 });
      setFiles(res.files);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const displayed = useMemo(() => {
    let items = files;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (f) =>
          f.original_filename.toLowerCase().includes(q) ||
          (f.subject ?? '').toLowerCase().includes(q) ||
          f.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    items = [...items].sort((a, b) => {
      switch (sortKey) {
        case 'date_asc':
          return new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime();
        case 'name_asc':
          return a.original_filename.localeCompare(b.original_filename);
        case 'size_desc':
          return b.file_size - a.file_size;
        case 'date_desc':
        default:
          return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime();
      }
    });
    return items;
  }, [files, search, sortKey]);

  const totalSize = useMemo(
    () => files.reduce((sum, f) => sum + f.file_size, 0),
    [files],
  );

  const handleDownload = async (f: UploadedFile) => {
    setDownloadingId(f.id);
    try {
      const blob = await uploadedFilesApi.downloadBlob(f.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.original_filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await uploadedFilesApi.remove(pendingDelete.id);
      setFiles((prev) => prev.filter((f) => f.id !== pendingDelete.id));
      toast.success('File deleted.');
    } catch (err) {
      console.error(err);
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-2 border-b border-white/5">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-[0.3em] aurora-glow">
            <Zap className="h-3.5 w-3.5 fill-primary" />
            Private File Library
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-foreground -mb-1">My Files</h1>
          <p className="text-muted-foreground font-medium text-sm">
            Upload syllabi & reference docs once, then reuse them in any generator.
          </p>
        </div>
        <button
          onClick={() => setPickerOpen(true)}
          className="h-14 px-6 aurora-gradient text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-primary/20 transition-all hover:translate-y-[-2px] active:translate-y-0 aurora-glow inline-flex items-center gap-3"
        >
          <CloudUpload className="w-5 h-5" />
          Upload Files
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid sm:grid-cols-3 gap-4">
        <StatPill label="Files" value={String(files.length)} />
        <StatPill label="Total size" value={formatBytes(totalSize)} />
        <StatPill
          label="Ready for reuse"
          value={String(files.filter((f) => f.has_text).length)}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by filename, subject, or tag…"
            className="w-full h-12 pl-11 pr-4 rounded-2xl border border-white/5 bg-black/40 outline-none font-medium text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
          />
        </div>
        <div className="relative">
          <ArrowDownUp className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-12 pl-11 pr-8 rounded-2xl border border-white/5 bg-black/40 outline-none font-bold text-xs uppercase tracking-wider focus:ring-2 focus:ring-primary/40 transition-all appearance-none cursor-pointer"
          >
            <option value="date_desc" className="bg-black">Newest first</option>
            <option value="date_asc" className="bg-black">Oldest first</option>
            <option value="name_asc" className="bg-black">Name (A→Z)</option>
            <option value="size_desc" className="bg-black">Largest first</option>
          </select>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-bold">Loading your library…</span>
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-24 bg-card/10 rounded-3xl border-2 border-dashed border-white/5">
          <FolderOpen className="w-16 h-16 mx-auto opacity-10 mb-4" />
          <p className="text-sm font-black uppercase tracking-[0.3em] opacity-40">
            {search ? 'No matches' : 'Your library is empty'}
          </p>
          {!search && (
            <button
              onClick={() => setPickerOpen(true)}
              className="mt-6 inline-flex items-center gap-2 text-primary text-xs font-bold hover:underline"
            >
              <CloudUpload className="w-4 h-4" /> Upload your first file
            </button>
          )}
        </div>
      ) : (
        <StaggerContainer className="grid gap-3">
          {displayed.map((f) => (
            <StaggerItem key={f.id}>
              <div className="group flex items-center gap-4 p-4 rounded-2xl bg-card/40 border border-white/5 hover:border-primary/20 transition-all">
                <div className="p-3 rounded-xl bg-primary/10 text-primary flex-shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black truncate">{f.original_filename}</h3>
                    {f.extraction_status === 'failed' && (
                      <span
                        title="Could not extract text — this file is downloadable but generators can't reuse it without re-uploading."
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full"
                      >
                        <AlertCircle className="w-3 h-3" /> no text
                      </span>
                    )}
                    {f.subject && (
                      <span className="inline-flex text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {f.subject}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground tabular-nums">
                    <span>{formatBytes(f.file_size)}</span>
                    <span>·</span>
                    <span title={formatDateTime(f.uploaded_at)}>{formatRelative(f.uploaded_at)}</span>
                    <span>·</span>
                    <span className="uppercase">
                      {f.original_filename.split('.').pop() || '—'}
                    </span>
                    {f.last_used_at && (
                      <>
                        <span>·</span>
                        <span className="text-primary/60">last used {formatRelative(f.last_used_at)}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleDownload(f)}
                    disabled={downloadingId === f.id}
                    className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
                    title="Download"
                  >
                    {downloadingId === f.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => setPendingDelete(f)}
                    className="p-2 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}

      <FilePicker
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          refresh();
        }}
        onConfirm={() => {
          setPickerOpen(false);
          refresh();
        }}
        mode="multi"
        defaultTab="upload"
      />

      {/* Delete confirm modal */}
      <AnimatePresence>
        {pendingDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setPendingDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-white/10 rounded-2xl p-8 max-w-md w-full"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 rounded-xl bg-red-500/10 text-red-400 flex-shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black mb-1">Delete this file?</h3>
                  <p className="text-sm text-muted-foreground">
                    "<span className="font-bold text-foreground">{pendingDelete.original_filename}</span>"
                    will be removed from your library and from storage. This cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPendingDelete(null)}
                  className="h-10 px-5 rounded-xl border border-white/10 text-sm font-bold hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="h-10 px-5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-black uppercase tracking-wider transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-5 rounded-2xl bg-card/40 border border-white/5 flex items-center gap-4">
      <Filter className="w-5 h-5 text-primary opacity-50" />
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/70">
          {label}
        </div>
        <div className="text-2xl font-black tabular-nums">{value}</div>
      </div>
    </div>
  );
}
