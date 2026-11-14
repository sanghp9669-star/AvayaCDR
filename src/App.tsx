import { useCallback, useEffect, useState } from 'react';
import type { CdrListResponse, CdrQueryFilter, CdrRecordDto } from '../shared/cdrTypes';
import { CdrDetailDrawer } from './components/CdrDetailDrawer';
import { CdrFilterBar } from './components/CdrFilterBar';
import { CdrImportView } from './components/CdrImportView';
import { CdrTable } from './components/CdrTable';
import { CmConfigGuideView } from './components/CmConfigGuideView';
import { KpiSummaryStrip } from './components/KpiSummaryStrip';
import { LoginScreen } from './components/LoginScreen';
import { Sidebar, type ActiveTab } from './components/Sidebar';
import { SystemUpdateView } from './components/SystemUpdateView';
import { TopBar } from './components/TopBar';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  downloadCdrCsv,
  fetchCdrDetail,
  fetchCdrList,
  seedSampleCdrs,
  triggerTcpTestCall,
} from './services/cdrApi';

const DEFAULT_FILTER: CdrQueryFilter = {
  from: undefined,
  to: undefined,
  station: '',
  calling_number: '',
  called_number: '',
  trunk_group: '',
  call_type: 'all',
  sortBy: 'call_start_time',
  sortDir: 'desc',
  page: 1,
  page_size: 25,
};

const EMPTY_DATA: CdrListResponse = {
  records: [],
  total: 0,
  page: 1,
  page_size: 25,
  total_pages: 1,
  summary: {
    totalCalls: 0,
    totalDurationSec: 0,
    avgDurationSec: 0,
    incomingCount: 0,
    outgoingCount: 0,
    tandemCount: 0,
    internalCount: 0,
    ineffectiveCount: 0,
  },
};

function DashboardShell() {
  const { user, loading: authLoading, logout, getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('cdr');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  const [filter, setFilter] = useState<CdrQueryFilter>(DEFAULT_FILTER);
  const [data, setData] = useState<CdrListResponse>(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedRecord, setSelectedRecord] = useState<CdrRecordDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sendingTcp, setSendingTcp] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [isDark]);

  const loadCdrList = useCallback(
    async (currentFilter: CdrQueryFilter, silent = false) => {
      if (!user) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const res = await fetchCdrList(token, currentFilter);
        setData(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu CDR.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [user, getToken]
  );

  useEffect(() => {
    if (!user || activeTab !== 'cdr') return;
    const timer = setTimeout(() => {
      void loadCdrList(filter);
    }, 150);
    return () => clearTimeout(timer);
  }, [user, activeTab, filter, loadCdrList]);

  useEffect(() => {
    if (!user || activeTab !== 'cdr' || !autoRefresh) return;
    const interval = setInterval(() => {
      void loadCdrList(filter, true);
    }, 5000);
    return () => clearInterval(interval);
  }, [user, activeTab, autoRefresh, filter, loadCdrList]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500">
        Đang khởi tạo phiên làm việc...
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const handleFilterChange = (patch: Partial<CdrQueryFilter>) => {
    setFilter((prev) => ({ ...prev, ...patch }));
  };

  const handleSort = (col: NonNullable<CdrQueryFilter['sortBy']>) => {
    setFilter((prev) => ({
      ...prev,
      sortBy: col,
      sortDir: prev.sortBy === col && prev.sortDir === 'desc' ? 'asc' : 'desc',
      page: 1,
    }));
  };

  const handleViewDetail = async (id: number) => {
    setDetailLoading(true);
    setSelectedRecord(null);
    try {
      const token = await getToken();
      const detail = await fetchCdrDetail(token, id);
      setSelectedRecord(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải chi tiết bản ghi.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSendTcpTest = async () => {
    setSendingTcp(true);
    setError(null);
    try {
      const token = await getToken();
      await triggerTcpTestCall(token);
      await loadCdrList(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi gửi gói CDR qua TCP.');
    } finally {
      setSendingTcp(false);
    }
  };

  const handleSeedSamples = async () => {
    setSeeding(true);
    setError(null);
    try {
      const token = await getToken();
      await seedSampleCdrs(token);
      await loadCdrList(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi nạp dữ liệu mẫu.');
    } finally {
      setSeeding(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const token = await getToken();
      await downloadCdrCsv(token, filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi xuất tệp CSV.');
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeTab={activeTab}
          userEmail={user.email}
          isDark={isDark}
          onToggleTheme={() => setIsDark((d) => !d)}
          onExportCsv={handleExportCsv}
          onLogout={logout}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto space-y-4">
          {activeTab === 'cdr' && (
            <>
              <CdrFilterBar
                filter={filter}
                onChange={handleFilterChange}
                onReset={() => setFilter(DEFAULT_FILTER)}
                onRefresh={() => void loadCdrList(filter)}
                refreshing={loading}
                autoRefresh={autoRefresh}
                onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
                onSendTcpTest={handleSendTcpTest}
                sendingTcp={sendingTcp}
              />

              {error && (
                <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}

              <KpiSummaryStrip summary={data.summary} loading={loading} />

              <CdrTable
                records={data.records}
                total={data.total}
                page={data.page}
                pageSize={data.page_size}
                totalPages={data.total_pages}
                loading={loading}
                sortBy={filter.sortBy}
                sortDir={filter.sortDir}
                selectedId={selectedRecord?.id ?? null}
                onSort={handleSort}
                onViewDetail={handleViewDetail}
                onPageChange={(page) => handleFilterChange({ page })}
                onPageSizeChange={(page_size) => handleFilterChange({ page_size, page: 1 })}
                onSeedSamples={handleSeedSamples}
                seeding={seeding}
              />
            </>
          )}

          {activeTab === 'import' && (
            <CdrImportView
              onImported={() => {
                void loadCdrList(filter);
              }}
            />
          )}

          {activeTab === 'cm-guide' && <CmConfigGuideView />}

          {activeTab === 'update' && <SystemUpdateView />}
        </main>
      </div>

      <CdrDetailDrawer
        record={selectedRecord}
        loading={detailLoading}
        onClose={() => {
          setSelectedRecord(null);
          setDetailLoading(false);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <DashboardShell />
    </AuthProvider>
  );
}
