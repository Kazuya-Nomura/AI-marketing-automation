import React from 'react';
import { 
  MessageSquare, Mail, Share2, Cloud, Brain, 
  CheckCircle, AlertCircle, Clock, Settings 
} from 'lucide-react';

const MyIntegrationsPage = () => {
  const integrations = [
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      icon: MessageSquare,
      status: 'connected',
      lastTested: '2 minutes ago',
      metrics: { messagesSent: 1250, deliveryRate: '98%' }
    },
    {
      id: 'email',
      name: 'Email (Gmail)',
      icon: Mail,
      status: 'connected',
      lastTested: '1 hour ago',
      metrics: { emailsSent: 3420, openRate: '24%' }
    },
    {
      id: 'social',
      name: 'Social Media',
      icon: Share2,
      status: 'partial',
      connectedPlatforms: ['Facebook', 'Instagram'],
      pendingPlatforms: ['LinkedIn', 'Twitter']
    },
    {
      id: 'cloud',
      name: 'Google Drive',
      icon: Cloud,
      status: 'connected',
      storage: { used: '2.3 GB', total: '15 GB' }
    },
    {
      id: 'ai',
      name: 'AI Services',
      icon: Brain,
      status: 'error',
      error: 'API key expired',
      services: ['OpenAI', 'ElevenLabs', 'Stable Diffusion']
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Integrations</h1>
          <p className="text-gray-600 mt-2">
            Manage your connected services and test connections
          </p>
        </div>

        {/* Integration Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {integrations.map((integration) => (
            <IntegrationTile key={integration.id} {...integration} />
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mt-12 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-4">
            <button className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              Import Leads
            </button>
            <button className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700">
              Create Campaign
            </button>
            <button className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
              View Analytics
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const IntegrationTile = ({ 
  name, icon: Icon, status, lastTested, metrics, error, 
  connectedPlatforms, pendingPlatforms, storage, services 
}) => {
  const statusConfig = {
    connected: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
    partial: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-50' },
    error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50' }
  };

  const StatusIcon = statusConfig[status].icon;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center space-x-3">
          <div className={`p-3 rounded-lg ${statusConfig[status].bg}`}>
            <Icon className={`w-6 h-6 ${statusConfig[status].color}`} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{name}</h3>
            <div className="flex items-center space-x-2 mt-1">
              <StatusIcon className={`w-4 h-4 ${statusConfig[status].color}`} />
              <span className="text-sm text-gray-600 capitalize">{status}</span>
            </div>
          </div>
        </div>
        <button className="text-gray-400 hover:text-gray-600">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Status-specific content */}
      {status === 'connected' && metrics && (
        <div className="space-y-2 mb-4">
          {Object.entries(metrics).map(([key, value]) => (
            <div key={key} className="flex justify-between text-sm">
              <span className="text-gray-600">{key}:</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </div>
      )}

      {status === 'partial' && (
        <div className="space-y-2 mb-4">
          <div className="text-sm">
            <span className="text-green-600">Connected:</span>
            <span className="ml-2">{connectedPlatforms?.join(', ')}</span>
          </div>
          <div className="text-sm">
            <span className="text-yellow-600">Pending:</span>
            <span className="ml-2">{pendingPlatforms?.join(', ')}</span>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="flex space-x-3">
        <button className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm font-medium">
          Test Connection
        </button>
        <button className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm font-medium">
          Configure
        </button>
      </div>

      {lastTested && (
        <p className="text-xs text-gray-500 mt-3 text-center">
          Last tested: {lastTested}
        </p>
      )}
    </div>
  );
};