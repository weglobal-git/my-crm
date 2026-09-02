"use client";

import React, { useState, useEffect } from 'react';
import { SettingsGroup, SettingsRow } from '@/components/layout/SettingsLayout';
import { BrainCircuit, Key, RefreshCcw, Save, Shield, AlertTriangle, Play, Pause } from 'lucide-react';
import { testProviderConnection, saveProviderConfig, setSystemAiStatus, getSystemAiStats } from '@/lib/actions/ai-admin';

export default function AIControlCenter() {
  const [providerKey, setProviderKey] = useState('GOOGLE_GEMINI');
  const [secretKey, setSecretKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);
  const [stats, setStats] = useState<{enabled: boolean, degraded: boolean, disabled: boolean, monthlyCost: number, budgetLimit: number} | null>(null);
  
  useEffect(() => {
    getSystemAiStats().then(setStats).catch(console.error);
  }, []);
  
  const handleTestConnection = async () => {
    if (!secretKey) return alert('Please enter a secret key first.');
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testProviderConnection(providerKey, secretKey);
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || 'Error connecting.' });
    }
    setIsTesting(false);
  };
  
  const handleSaveConfig = async () => {
    if (!secretKey) return alert('Please enter a secret key first.');
    if (!confirm('Are you sure you want to update the AI Provider secret? This action will be audited.')) return;
    
    setIsSaving(true);
    try {
      const result = await saveProviderConfig(providerKey, secretKey);
      if (result.success) {
        alert('Configuration saved securely.');
        setSecretKey(''); // Clear input after save
      } else {
        alert(`Failed to save: ${result.message}`);
      }
    } catch (e: any) {
      alert(`Error saving: ${e.message}`);
    }
    setIsSaving(false);
  };

  const handleToggleSystemStatus = async () => {
    if (!stats) return;
    const isPaused = stats.disabled; 
    const pauseTarget = !isPaused;
    if (!confirm(`Are you sure you want to ${pauseTarget ? 'pause' : 'resume'} the AI System?`)) return;
    
    try {
      const result = await setSystemAiStatus(pauseTarget);
      if (result.success) {
        setStats(prev => prev ? { ...prev, enabled: !pauseTarget, disabled: pauseTarget, degraded: false } : prev);
      } else {
        alert(`Failed: ${result.message}`);
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  };

  const getStatusColor = () => {
    if (!stats) return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    if (stats.enabled) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (stats.degraded) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
  };

  const getStatusText = () => {
    if (!stats) return 'LOADING';
    if (stats.enabled) return 'ACTIVE';
    if (stats.degraded) return 'DEGRADED';
    return 'PAUSED';
  };

  return (
    <div className="space-y-6">
      <SettingsGroup label="Overview">
        <SettingsRow>
          <div className="flex flex-col gap-2 w-full py-2">
            <div className="flex justify-between items-center">
              <span className="font-medium text-slate-200">System Status</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor()}`}>
                {getStatusText()}
              </span>
            </div>
            <p className="text-sm text-slate-400">
              {stats?.disabled ? 'The AI Event Summarizer is currently paused and not processing the outbox.' : 
               stats?.degraded ? 'The AI System is experiencing high error rates.' :
               'The AI Event Summarizer agent is currently processing events in the outbox.'}
            </p>
          </div>
        </SettingsRow>
        <SettingsRow>
          <div className="flex gap-4 w-full justify-between items-center">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-slate-400">Monthly Usage</span>
              <span className="text-2xl font-bold text-slate-100">${stats?.monthlyCost.toFixed(2) || '0.00'}</span>
            </div>
            <div className="flex flex-col gap-1 text-right">
              <span className="text-sm text-slate-400">Budget Limit</span>
              <span className="text-lg font-medium text-slate-200">${stats?.budgetLimit.toFixed(2) || '1.00'}</span>
            </div>
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup label="Models & Providers">
        <SettingsRow>
          <div className="flex flex-col gap-4 w-full py-2">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Active Provider</label>
              <select 
                value={providerKey}
                onChange={e => setProviderKey(e.target.value)}
                className="w-full bg-[#1C1C1D] border border-[#4E4F50] rounded-md px-3 py-2 text-sm text-white focus:border-[#C7F33C] outline-none"
              >
                <option value="GOOGLE_GEMINI">Google Gemini</option>
                <option value="OPENAI">OpenAI (Not Configured)</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">API Secret Key</label>
              <div className="flex gap-2">
                <input 
                  type="password"
                  value={secretKey}
                  onChange={e => setSecretKey(e.target.value)}
                  placeholder="Enter new API key (Write-only)"
                  className="flex-1 bg-[#1C1C1D] border border-[#4E4F50] rounded-md px-3 py-2 text-sm text-white focus:border-[#C7F33C] outline-none"
                />
                <button 
                  onClick={handleTestConnection}
                  disabled={isTesting || !secretKey}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-[#252728] hover:bg-[#3A3B3C] text-slate-300 rounded-md border border-[#4E4F50] transition-colors disabled:opacity-50"
                >
                  {isTesting ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                  Test
                </button>
              </div>
            </div>

            {testResult && (
              <div className={`p-3 rounded-md text-sm flex gap-2 items-start ${testResult.success ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {testResult.success ? <Shield className="w-4 h-4 mt-0.5" /> : <AlertTriangle className="w-4 h-4 mt-0.5" />}
                <div>
                  <p className="font-medium">{testResult.success ? 'Connection Successful' : 'Connection Failed'}</p>
                  <p className="opacity-90">{testResult.message}</p>
                  {testResult.latency && <p className="text-xs opacity-70 mt-1">Latency: {testResult.latency}ms</p>}
                </div>
              </div>
            )}
            
            <div className="flex justify-end pt-2">
              <button 
                onClick={handleSaveConfig}
                disabled={isSaving || !secretKey}
                className="flex items-center gap-2 px-4 py-2 bg-[#C7F33C] hover:bg-[#b5dc35] text-black font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {isSaving ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Configuration
              </button>
            </div>
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup label="Operations">
        <SettingsRow>
          <div className="flex justify-between items-center w-full">
            <div>
              <p className="font-medium text-slate-200">Global AI Pause</p>
              <p className="text-sm text-slate-400 mt-1">Temporarily stops the AI agent from processing the outbox.</p>
            </div>
            <button 
              onClick={handleToggleSystemStatus}
              disabled={!stats}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-colors disabled:opacity-50 ${
                stats?.disabled 
                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border-emerald-500/20' 
                  : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border-rose-500/20'
              }`}
            >
              {stats?.disabled ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {stats?.disabled ? 'Resume Agent' : 'Pause Agent'}
            </button>
          </div>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}
