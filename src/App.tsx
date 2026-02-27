import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Activity, Clock, Download, Upload, Play, Trash2, Wifi, WifiOff } from 'lucide-react';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SpeedTest {
  id: number;
  timestamp: string;
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
}

export default function App() {
  const [tests, setTests] = useState<SpeedTest[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [autoTestEnabled, setAutoTestEnabled] = useState(false);
  const [lastTestTime, setLastTestTime] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const autoTestIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/speedtests');
      if (!res.ok) throw new Error('履歴の取得に失敗しました');
      const data = await res.json();
      setTests(data);
      if (data.length > 0) {
        setLastTestTime(new Date(data[0].timestamp + 'Z')); // SQLite returns UTC
      }
    } catch (err) {
      console.error(err);
      setError('履歴を読み込めませんでした。');
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const runSpeedTest = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setError(null);

    try {
      // 1. Measure Ping
      const pingStart = performance.now();
      await fetch('/api/ping', { cache: 'no-store' });
      const pingEnd = performance.now();
      const ping_ms = pingEnd - pingStart;

      // 2. Measure Download Speed (5MB payload)
      const downloadStart = performance.now();
      const res = await fetch('/api/payload', { cache: 'no-store' });
      const blob = await res.blob();
      const downloadEnd = performance.now();

      const durationInSeconds = (downloadEnd - downloadStart) / 1000;
      const bitsLoaded = blob.size * 8;
      const speedBps = bitsLoaded / durationInSeconds;
      const download_mbps = speedBps / (1024 * 1024);

      // 3. Measure Upload Speed (2MB payload)
      const uploadData = new Blob([new Uint8Array(2 * 1024 * 1024)]);
      const uploadStart = performance.now();
      await fetch('/api/upload', { 
        method: 'POST', 
        body: uploadData,
        cache: 'no-store'
      });
      const uploadEnd = performance.now();
      
      const uploadDurationInSeconds = (uploadEnd - uploadStart) / 1000;
      const uploadBitsLoaded = uploadData.size * 8;
      const uploadSpeedBps = uploadBitsLoaded / uploadDurationInSeconds;
      const upload_mbps = uploadSpeedBps / (1024 * 1024);

      // 4. Save Result
      const saveRes = await fetch('/api/speedtests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          download_mbps: Number(download_mbps.toFixed(2)),
          upload_mbps: Number(upload_mbps.toFixed(2)),
          ping_ms: Number(ping_ms.toFixed(2)),
        }),
      });

      if (!saveRes.ok) throw new Error('測定結果の保存に失敗しました');
      
      const newTest = await saveRes.json();
      setTests((prev) => [newTest, ...prev].slice(0, 100));
      setLastTestTime(new Date(newTest.timestamp + 'Z'));
    } catch (err) {
      console.error(err);
      setError('測定に失敗しました。もう一度お試しください。');
    } finally {
      setIsRunning(false);
    }
  }, [isRunning]);

  // Handle Auto-Test
  useEffect(() => {
    if (autoTestEnabled) {
      autoTestIntervalRef.current = setInterval(() => {
        runSpeedTest();
      }, 30 * 60 * 1000);
    } else {
      if (autoTestIntervalRef.current) {
        clearInterval(autoTestIntervalRef.current);
      }
    }

    return () => {
      if (autoTestIntervalRef.current) {
        clearInterval(autoTestIntervalRef.current);
      }
    };
  }, [autoTestEnabled, runSpeedTest]);

  const clearHistory = async () => {
    if (!confirm('すべての履歴を削除してもよろしいですか？')) return;
    try {
      await fetch('/api/speedtests', { method: 'DELETE' });
      setTests([]);
      setLastTestTime(null);
    } catch (err) {
      console.error(err);
      setError('履歴の削除に失敗しました。');
    }
  };

  const latestTest = tests.length > 0 ? tests[0] : null;

  // Prepare chart data (reverse so oldest is first)
  const chartData = [...tests].reverse().map(t => ({
    ...t,
    timeLabel: format(new Date(t.timestamp + 'Z'), 'HH:mm'),
    fullDate: format(new Date(t.timestamp + 'Z'), 'yyyy/MM/dd HH:mm'),
  }));

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
              <Activity className="w-8 h-8 text-indigo-600" />
              通信速度トラッカー
            </h1>
            <p className="text-neutral-500 mt-1">インターネット回線の速度を自動で監視・記録します。</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoTestEnabled(!autoTestEnabled)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors",
                autoTestEnabled 
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" 
                  : "bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
              )}
            >
              {autoTestEnabled ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              自動測定 (30分)
            </button>
            
            <button
              onClick={runSpeedTest}
              disabled={isRunning}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-full text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <Play className={cn("w-4 h-4", isRunning && "animate-pulse")} />
              {isRunning ? '測定中...' : '今すぐ測定'}
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 text-sm">
            {error}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-100 flex flex-col">
            <div className="flex items-center gap-2 text-neutral-500 mb-3">
              <Download className="w-5 h-5 text-indigo-500" />
              <h2 className="font-medium text-sm">最新ダウンロード</h2>
            </div>
            <div className="mt-auto">
              <span className="text-3xl font-semibold tracking-tight">
                {latestTest ? latestTest.download_mbps.toFixed(1) : '--'}
              </span>
              <span className="text-neutral-500 ml-1 text-sm">Mbps</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-100 flex flex-col">
            <div className="flex items-center gap-2 text-neutral-500 mb-3">
              <Upload className="w-5 h-5 text-emerald-500" />
              <h2 className="font-medium text-sm">最新アップロード</h2>
            </div>
            <div className="mt-auto">
              <span className="text-3xl font-semibold tracking-tight">
                {latestTest && latestTest.upload_mbps != null ? latestTest.upload_mbps.toFixed(1) : '--'}
              </span>
              <span className="text-neutral-500 ml-1 text-sm">Mbps</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-100 flex flex-col">
            <div className="flex items-center gap-2 text-neutral-500 mb-3">
              <Activity className="w-5 h-5 text-amber-500" />
              <h2 className="font-medium text-sm">最新Ping</h2>
            </div>
            <div className="mt-auto">
              <span className="text-3xl font-semibold tracking-tight">
                {latestTest ? latestTest.ping_ms.toFixed(0) : '--'}
              </span>
              <span className="text-neutral-500 ml-1 text-sm">ms</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-100 flex flex-col">
            <div className="flex items-center gap-2 text-neutral-500 mb-3">
              <Clock className="w-5 h-5 text-blue-500" />
              <h2 className="font-medium text-sm">最終測定</h2>
            </div>
            <div className="mt-auto">
              <span className="text-2xl font-semibold tracking-tight">
                {lastTestTime ? format(lastTestTime, 'HH:mm') : '--:--'}
              </span>
              <div className="text-xs text-neutral-400 mt-1">
                {lastTestTime ? format(lastTestTime, 'yyyy/MM/dd') : '未測定'}
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100">
          <h2 className="text-lg font-semibold mb-6">通信速度の推移</h2>
          <div className="w-full" style={{ minHeight: 300 }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorDownload" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorUpload" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                  <XAxis 
                    dataKey="timeLabel" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#a3a3a3', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#a3a3a3', fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                    labelStyle={{ color: '#737373', marginBottom: '4px' }}
                    formatter={(value: number, name: string) => [
                      `${value} Mbps`, 
                      name === 'download_mbps' ? 'ダウンロード' : 'アップロード'
                    ]}
                    labelFormatter={(label, payload) => {
                      if (payload && payload.length > 0) {
                        return payload[0].payload.fullDate;
                      }
                      return label;
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="download_mbps" 
                    name="download_mbps"
                    stroke="#4f46e5" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorDownload)" 
                    activeDot={{ r: 6, strokeWidth: 0, fill: '#4f46e5' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="upload_mbps" 
                    name="upload_mbps"
                    stroke="#10b981" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorUpload)" 
                    activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-400">
                データがありません。測定を実行してください。
              </div>
            )}
          </div>
        </div>

        {/* History Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
          <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold">測定履歴</h2>
            {tests.length > 0 && (
              <button 
                onClick={clearHistory}
                className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1 font-medium"
              >
                <Trash2 className="w-4 h-4" />
                履歴をクリア
              </button>
            )}
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-6 py-4 font-medium">測定日時</th>
                  <th className="px-6 py-4 font-medium">ダウンロード (Mbps)</th>
                  <th className="px-6 py-4 font-medium">アップロード (Mbps)</th>
                  <th className="px-6 py-4 font-medium">Ping (ms)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {tests.length > 0 ? (
                  tests.map((test) => (
                    <tr key={test.id} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="px-6 py-4 text-neutral-600">
                        {format(new Date(test.timestamp + 'Z'), 'yyyy/MM/dd HH:mm:ss')}
                      </td>
                      <td className="px-6 py-4 font-medium text-neutral-900">
                        {test.download_mbps.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 font-medium text-neutral-900">
                        {test.upload_mbps != null ? test.upload_mbps.toFixed(2) : '--'}
                      </td>
                      <td className="px-6 py-4 text-neutral-600">
                        {test.ping_ms.toFixed(0)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-neutral-400">
                      測定履歴がありません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
