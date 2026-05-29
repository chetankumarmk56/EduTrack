import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CloudUpload,
  FolderOpen,
  Loader2,
  Search,
  X,
  FileText,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/shared/lib/utils';
import { formatBytes, formatRelative } from '@/shared/lib/format';
import {
  ALLOWED_EXTENSIONS,
  MAX_FILES_PER_REQUEST,
  MAX_FILE_BYTES,
  uploadedFilesApi,
  type UploadedFile,
} from '@/features/my-files/api';

type Tab = 'library' | 'upload';

export interface FilePickerProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Called when the user closes the modal without confirming. */
  onClose: () => void;
  /** Called when the user confirms one or more files. */
  onConfirm: (files: UploadedFile[]) => void;
  /** "single" = pick exactly one; "multi" = pick up to {maxFiles}. */
  mode?: 'single' | 'multi';
  /** Max files the caller wants to receive. Defaults to 1 (single) or 9 (multi). */
  maxFiles?: number;
  /** Pre-filter by extensions (no leading dot). Defaults to all supported types. */
  accept?: string[];
  /** Default starting tab. */
  defaultTab?: Tab;
}

const DEFAULT_ACCEPT = ALLOWED_EXTENSIONS.map((e) => e.replace('.', ''));

export function FilePicker({
  open,
  onClose,
  onConfirm,
  mode = 'single',
  maxFiles,
  accept = DEFAULT_ACCEPT,
  defaultTab = 'library',
}: FilePickerProps) {
  const cap = maxFiles ?? (mode === 'single' ? 1 : MAX_FILES_PER_REQUEST);
  const acceptSet = useMemo(() => new Set(accept.map((a) => a.toLowerCase())), [accept]);
  const acceptAttr = useMemo(() => accept.map((a) => `.${a}`).join(','), [accept]);

  const [tab, setTab] = useState<Tab>(defaultTab);
  const [library, setLibrary] = useState<UploadedFile[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const filteredLibrary = useMemo(() => {
    let items = library;
    if (accept.length > 0) {
      items = items.filter((f) => {
        const ext = f.original_filename.split('.').pop()?.toLowerCase() ?? '';
        return acceptSet.has(ext);
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (f) =>
          f.original_filename.toLowerCase().includes(q) ||
          (f.subject ?? '').toLowerCase().includes(q) ||
          f.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return items;
  }, [library, search, accept, acceptSet]);

  const fetchLibrary = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await uploadedFilesApi.list({ limit: 200 });
      setLibrary(res.files);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setTab(defaultTab);
      setSelectedIds(new Set());
      setStagedFiles([]);
      setSearch('');
      fetchLibrary();
    }
  }, [open, defaultTab, fetchLibrary]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (mode === 'single') {
        next.clear();
        next.add(id);
      } else if (next.size < cap) {
        next.add(id);
      } else {
        toast.error(`You can pick at most ${cap} file${cap === 1 ? '' : 's'}.`);
        return prev;
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const picked = library.filter((f) => selectedIds.has(f.id));
    if (picked.length === 0) {
      toast.error('Pick at least one file.');
      return;
    }
    onConfirm(picked);
  };

  // ----- Upload tab handlers -----
  const validateAndStage = (incoming: File[]) => {
    const out: File[] = [...stagedFiles];
    for (const file of incoming) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!acceptSet.has(ext)) {
        toast.error(`"${file.name}" is not a supported type.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`"${file.name}" exceeds ${formatBytes(MAX_FILE_BYTES)}.`);
        continue;
      }
      if (out.length >= MAX_FILES_PER_REQUEST) {
        toast.error(`At most ${MAX_FILES_PER_REQUEST} files per upload.`);
        break;
      }
      if (out.some((f) => f.name === file.name && f.size === file.size)) continue;
      out.push(file);
    }
    setStagedFiles(out);
  };

  const handleUpload = async () => {
    if (stagedFiles.length === 0) return;
    setIsUploading(true);
    try {
      const res = await uploadedFilesApi.upload(stagedFiles);
      // Refresh library so the new ones are pickable immediately.
      await fetchLibrary();
      // Pre-select the freshly uploaded files (respecting cap).
      const accepted = res.accepted
        .map((a) => a.file?.id)
        .filter((x): x is number => typeof x === 'number');
      setSelectedIds(() => {
        const next = new Set<number>();
        for (const id of accepted) {
          if (next.size >= cap) break;
          next.add(id);
        }
        return next;
      });
      setStagedFiles([]);
      if (res.rejected.length === 0 && res.accepted.length > 0) {
        toast.success(`Uploaded ${res.accepted.length} file(s).`);
        setTab('library');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  // ----- Render -----
  const tree = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] modal-scrim flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[85vh] bg-card border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <div>
                <h2 className="text-xl font-black tracking-tight">Pick a file</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {mode === 'single'
                    ? 'Reuse a previously uploaded file or upload a new one.'
                    : `Select up to ${cap} files.`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/5">
              <TabButton active={tab === 'library'} onClick={() => setTab('library')}>
                <FolderOpen className="w-4 h-4" /> My Files
                <span className="ml-1.5 text-[10px] opacity-60 tabular-nums">{library.length}</span>
              </TabButton>
              <TabButton active={tab === 'upload'} onClick={() => setTab('upload')}>
                <CloudUpload className="w-4 h-4" /> Upload New
                {stagedFiles.length > 0 && (
                  <span className="ml-1.5 text-[10px] bg-primary/20 text-primary px-2 rounded-full">
                    {stagedFiles.length}
                  </span>
                )}
              </TabButton>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              {tab === 'library' ? (
                <LibraryTab
                  files={filteredLibrary}
                  search={search}
                  setSearch={setSearch}
                  selectedIds={selectedIds}
                  toggleSelect={toggleSelect}
                  isLoading={isLoading}
                />
              ) : (
                <UploadTab
                  staged={stagedFiles}
                  setStaged={setStagedFiles}
                  acceptAttr={acceptAttr}
                  validateAndStage={validateAndStage}
                  isUploading={isUploading}
                  onUpload={handleUpload}
                />
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-4 p-5 border-t border-white/5 bg-black/20">
              <div className="text-xs text-muted-foreground">
                {tab === 'library' ? (
                  <>
                    {selectedIds.size} selected · {filteredLibrary.length} visible
                  </>
                ) : (
                  <>
                    Allowed: {accept.join(', ')} · max {formatBytes(MAX_FILE_BYTES)} per file · up
                    to {MAX_FILES_PER_REQUEST} per upload
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="h-10 px-5 rounded-xl border border-white/10 text-sm font-bold hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                {tab === 'library' ? (
                  <button
                    onClick={handleConfirm}
                    disabled={selectedIds.size === 0}
                    className="h-10 px-5 rounded-xl aurora-gradient text-white text-sm font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Use {selectedIds.size > 0 ? `${selectedIds.size} file${selectedIds.size === 1 ? '' : 's'}` : ''}
                  </button>
                ) : (
                  <button
                    onClick={handleUpload}
                    disabled={stagedFiles.length === 0 || isUploading}
                    className="h-10 px-5 rounded-xl aurora-gradient text-white text-sm font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  >
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                    Upload {stagedFiles.length > 0 && `(${stagedFiles.length})`}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return tree;
  return createPortal(tree, document.body);
}

// ----------------------------------------------------------------------
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-[0.15em] transition-all relative',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      {active && (
        <motion.div
          layoutId="filepicker-tab-underline"
          className="absolute bottom-0 left-0 right-0 h-0.5 aurora-gradient"
        />
      )}
    </button>
  );
}

function LibraryTab({
  files,
  search,
  setSearch,
  selectedIds,
  toggleSelect,
  isLoading,
}: {
  files: UploadedFile[];
  search: string;
  setSearch: (s: string) => void;
  selectedIds: Set<number>;
  toggleSelect: (id: number) => void;
  isLoading: boolean;
}) {
  return (
    <>
      <div className="p-4 border-b border-white/5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by filename, subject, or tag…"
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-black/30 border border-white/5 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading library…</span>
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FolderOpen className="w-12 h-12 mx-auto opacity-30 mb-3" />
            <p className="text-sm">
              {search ? 'No files match your search.' : 'Your library is empty — upload some files to get started.'}
            </p>
          </div>
        ) : (
          files.map((f) => {
            const selected = selectedIds.has(f.id);
            return (
              <button
                key={f.id}
                onClick={() => toggleSelect(f.id)}
                className={cn(
                  'w-full flex items-center gap-4 p-3 rounded-xl border text-left transition-all',
                  selected
                    ? 'bg-primary/10 border-primary/40 aurora-glow'
                    : 'bg-black/20 border-white/5 hover:border-primary/20 hover:bg-white/5',
                )}
              >
                <div
                  className={cn(
                    'p-2.5 rounded-lg flex-shrink-0',
                    selected ? 'aurora-gradient text-white' : 'bg-white/5 text-muted-foreground',
                  )}
                >
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold truncate">{f.original_filename}</p>
                    {f.extraction_status === 'failed' && (
                      <AlertCircle
                        className="w-3.5 h-3.5 text-amber-400 flex-shrink-0"
                        aria-label="Text extraction failed — generators may not be able to reuse this file."
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                    <span>{formatBytes(f.file_size)}</span>
                    <span>·</span>
                    <span>{formatRelative(f.uploaded_at)}</span>
                    {f.subject && (
                      <>
                        <span>·</span>
                        <span className="text-primary/70">{f.subject}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {selected ? (
                    <CheckCircle2 className="w-5 h-5 text-primary fill-primary/30" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-white/10" />
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

function UploadTab({
  staged,
  setStaged,
  acceptAttr,
  validateAndStage,
  isUploading,
  onUpload,
}: {
  staged: File[];
  setStaged: (next: File[]) => void;
  acceptAttr: string;
  validateAndStage: (files: File[]) => void;
  isUploading: boolean;
  onUpload: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const dropped = Array.from(e.dataTransfer.files);
          if (dropped.length > 0) validateAndStage(dropped);
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-3 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all',
          isDragging
            ? 'border-primary bg-primary/10 aurora-glow'
            : 'border-white/10 bg-black/20 hover:border-primary/40 hover:bg-primary/5',
        )}
      >
        <div className="p-4 rounded-2xl aurora-gradient text-white">
          <CloudUpload className="w-7 h-7" />
        </div>
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-wider">
            Drop files here or click to browse
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Up to {MAX_FILES_PER_REQUEST} files · {formatBytes(MAX_FILE_BYTES)} each
          </p>
        </div>
        <input
          type="file"
          hidden
          multiple
          accept={acceptAttr}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) validateAndStage(files);
            // reset so re-selecting the same file fires onChange
            e.currentTarget.value = '';
          }}
        />
      </label>

      {staged.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Ready to upload ({staged.length})
            </h4>
            <button
              onClick={() => setStaged([])}
              className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-red-400"
            >
              Clear all
            </button>
          </div>
          {staged.map((f, idx) => (
            <div
              key={`${f.name}-${idx}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-white/5"
            >
              <FileText className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{f.name}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">{formatBytes(f.size)}</p>
              </div>
              <button
                onClick={() => setStaged(staged.filter((_, i) => i !== idx))}
                disabled={isUploading}
                className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            onClick={onUpload}
            disabled={isUploading}
            className="w-full h-11 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs font-black uppercase tracking-wider inline-flex items-center justify-center gap-2 transition-all disabled:opacity-40"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Upload {staged.length} file{staged.length === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </div>
  );
}
