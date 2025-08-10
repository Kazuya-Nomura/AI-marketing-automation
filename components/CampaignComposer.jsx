import React, { useState } from 'react';
import { 
  MessageSquare, Mail, Share2, Brain, 
  Plus, Play, Calendar, Users 
} from 'lucide-react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

const CampaignComposer = () => {
  const [campaign, setCampaign] = useState({
    name: '',
    audience: null,
    channels: [],
    schedule: null
  });

  const channelTypes = [
    { id: 'whatsapp', name: 'WhatsApp', icon: MessageSquare, color: 'bg-green-500' },
    { id: 'email', name: 'Email', icon: Mail, color: 'bg-blue-500' },
    { id: 'facebook', name: 'Facebook', icon: Share2, color: 'bg-blue-600' },
    { id: 'instagram', name: 'Instagram', icon: Share2, color: 'bg-pink-500' },
    { id: 'ai-content', name: 'AI Content', icon: Brain, color: 'bg-purple-500' }
  ];

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <input
                  type="text"
                  placeholder="Campaign Name"
                  className="text-2xl font-bold bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-indigo-500 outline-none"
                  value={campaign.name}
                  onChange={(e) => setCampaign({ ...campaign, name: e.target.value })}
                />
                <p className="text-gray-600 mt-2">
                  Create a multi-channel marketing campaign
                </p>
              </div>
              <div className="flex space-x-4">
                <button className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 flex items-center space-x-2">
                  <Calendar className="w-5 h-5" />
                  <span>Schedule</span>
                </button>
                <button className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center space-x-2">
                  <Play className="w-5 h-5" />
                  <span>Launch Campaign</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-6">
            {/* Channel Palette */}
            <div className="col-span-3">
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Channels</h3>
                <div className="space-y-3">
                  {channelTypes.map((channel) => (
                    <ChannelDraggable key={channel.id} channel={channel} />
                  ))}
                </div>
              </div>

              {/* Audience Selector */}
              <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
                <h3 className="font-semibold text-gray-900 mb-4">Audience</h3>
                <button className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-500 flex items-center justify-center space-x-2">
                  <Users className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-600">Select Audience</span>
                </button>
              </div>
            </div>

            {/* Campaign Canvas */}
            <div className="col-span-9">
              <CampaignCanvas 
                campaign={campaign} 
                setCampaign={setCampaign} 
              />
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
};

const ChannelDraggable = ({ channel }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'channel',
    item: channel,
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    })
  });

  const Icon = channel.icon;

  return (
    <div
      ref={drag}
      className={`p-4 bg-gray-50 rounded-lg cursor-move hover:bg-gray-100 flex items-center space-x-3 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className={`p-2 rounded-lg ${channel.color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <span className="font-medium text-gray-700">{channel.name}</span>
    </div>
  );
};

const CampaignCanvas = ({ campaign, setCampaign }) => {
  const [{ isOver }, drop] = useDrop({
    accept: 'channel',
    drop: (item) => {
      setCampaign(prev => ({
        ...prev,
        channels: [...prev.channels, {
          ...item,
          id: `${item.id}-${Date.now()}`,
          content: '',
          settings: {}
        }]
      }));
    },
    collect: (monitor) => ({
      isOver: monitor.isOver()
    })
  });

  return (
    <div
      ref={drop}
      className={`bg-white rounded-lg shadow-sm p-6 min-h-[600px] ${
        isOver ? 'border-2 border-indigo-500 border-dashed' : ''
      }`}
    >
      {campaign.channels.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <Plus className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">
              Drag channels here to build your campaign
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {campaign.channels.map((channel, index) => (
            <ChannelCard 
              key={channel.id} 
              channel={channel} 
              index={index}
              updateChannel={(updates) => {
                const newChannels = [...campaign.channels];
                newChannels[index] = { ...channel, ...updates };
                setCampaign({ ...campaign, channels: newChannels });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};