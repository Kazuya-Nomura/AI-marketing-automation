import { useState } from 'react';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { useMutation } from 'react-query';
import Layout from '../../components/Layout';
import { api } from '../../utils/api';

export default function CreateCampaign() {
  const router = useRouter();
  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [aiGenerating, setAiGenerating] = useState(false);

  const createCampaignMutation = useMutation(
    (data) => api.post('/campaigns', data),
    {
      onSuccess: () => {
        router.push('/campaigns');
      }
    }
  );

  const generateContentWithAI = async (channel) => {
    setAiGenerating(true);
    try {
      const response = await api.post('/ai/generate-content', {
        channel,
        property: watch('property'),
        tone: watch('tone')
      });
      
      // Set the generated content in the form
      document.getElementById(`content-${channel}`).value = response.data.content;
    } catch (error) {
      console.error('AI generation error:', error);
    }
    setAiGenerating(false);
  };

  const onSubmit = (data) => {
    const campaignData = {
      ...data,
      channels: selectedChannels,
      content: selectedChannels.reduce((acc, channel) => {
        acc[channel] = document.getElementById(`content-${channel}`).value;
        return acc;
      }, {})
    };
    
    createCampaignMutation.mutate(campaignData);
  };

  const channels = [
    { id: 'whatsapp', name: 'WhatsApp', icon: '💬' },
    { id: 'email', name: 'Email', icon: '📧' },
    { id: 'sms', name: 'SMS', icon: '📱' },
    { id: 'facebook', name: 'Facebook', icon: '👥' },
    { id: 'instagram', name: 'Instagram', icon: '📷' },
    { id: 'linkedin', name: 'LinkedIn', icon: '💼' }
  ];

  return (
    <Layout>
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <h1 className="text-2xl font-semibold text-gray-900">Create Campaign</h1>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-8">
            {/* Basic Information */}
            <div className="bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
              <div className="md:grid md:grid-cols-3 md:gap-6">
                <div className="md:col-span-1">
                  <h3 className="text-lg font-medium leading-6 text-gray-900">Basic Information</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Set up your campaign details and targeting.
                  </p>
                </div>
                
                <div className="mt-5 md:mt-0 md:col-span-2">
                  <div className="grid grid-cols-6 gap-6">
                    <div className="col-span-6">
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                        Campaign Name
                      </label>
                      <input
                        type="text"
                        {...register('name', { required: 'Campaign name is required' })}
                        className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                      />
                      {errors.name && (
                        <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                      )}
                    </div>

                    <div className="col-span-6">
                      <label htmlFor="property" className="block text-sm font-medium text-gray-700">
                        Property
                      </label>
                      <select
                        {...register('property', { required: 'Please select a property' })}
                        className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      >
                        <option value="">Select a property</option>
                        <option value="goa-beach-resort">Goa Beach Resort</option>
                        <option value="udaipur-palace">Udaipur Palace View</option>
                        <option value="dubai-waterfront">Dubai Waterfront</option>
                      </select>
                    </div>

                    <div className="col-span-6">
                      <label htmlFor="audience" className="block text-sm font-medium text-gray-700">
                        Target Audience
                      </label>
                      <select
                        {...register('audience', { required: 'Please select target audience' })}
                        className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      >
                        <option value="">Select audience</option>
                        <option value="hot-leads">Hot Leads (Score 70+)</option>
                        <option value="warm-leads">Warm Leads (Score 40-70)</option>
                        <option value="cold-leads">Cold Leads (Score below 40)</option>
                        <option value="all-leads">All Leads</option>
                      </select>
                    </div>

                    <div className="col-span-6">
                      <label htmlFor="tone" className="block text-sm font-medium text-gray-700">
                        Message Tone
                      </label>
                      <select
                        {...register('tone')}
                        className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      >
                        <option value="professional">Professional</option>
                        <option value="friendly">Friendly</option>
                        <option value="urgent">Urgent</option>
                        <option value="exclusive">Exclusive</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Channel Selection */}
            <div className="bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
              <div className="md:grid md:grid-cols-3 md:gap-6">
                <div className="md:col-span-1">
                  <h3 className="text-lg font-medium leading-6 text-gray-900">Channels</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Select channels for your campaign.
                  </p>
                </div>
                
                <div className="mt-5 md:mt-0 md:col-span-2">
                  <div className="grid grid-cols-3 gap-4">
                    {channels.map((channel) => (
                      <div
                        key={channel.id}
                        onClick={() => {
                          if (selectedChannels.includes(channel.id)) {
                            setSelectedChannels(selectedChannels.filter(c => c !== channel.id));
                          } else {
                            setSelectedChannels([...selectedChannels, channel.id]);
                          }
                        }}
                        className={`
                          cursor-pointer rounded-lg p-4 text-center border-2 transition-all
                          ${selectedChannels.includes(channel.id) 
                            ? 'border-indigo-500 bg-indigo-50' 
                            : 'border-gray-200 hover:border-gray-300'
                          }
                        `}
                      >
                        <div className="text-2xl mb-1">{channel.icon}</div>
                        <div className="text-sm font-medium">{channel.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Content Creation */}
            {selectedChannels.length > 0 && (
              <div className="bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
                <div className="md:grid md:grid-cols-3 md:gap-6">
                  <div className="md:col-span-1">
                    <h3 className="text-lg font-medium leading-6 text-gray-900">Content</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Create content for each channel.
                    </p>
                  </div>
                  
                  <div className="mt-5 md:mt-0 md:col-span-2 space-y-6">
                    {selectedChannels.map((channel) => (
                      <div key={channel}>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-sm font-medium text-gray-700 capitalize">
                            {channel} Content
                          </label>
                          <button
                            type="button"
                            onClick={() => generateContentWithAI(channel)}
                            disabled={aiGenerating}
                            className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            {aiGenerating ? 'Generating...' : 'Generate with AI'}
                          </button>
                        </div>
                        <textarea
                          id={`content-${channel}`}
                          rows={4}
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                          placeholder={`Enter ${channel} message content...`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Schedule */}
            <div className="bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
              <div className="md:grid md:grid-cols-3 md:gap-6">
                <div className="md:col-span-1">
                  <h3 className="text-lg font-medium leading-6 text-gray-900">Schedule</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    When should this campaign run?
                  </p>
                </div>
                
                <div className="mt-5 md:mt-0 md:col-span-2">
                  <div className="mt-4 space-y-4">
                    <div className="flex items-start">
                      <div className="flex items-center h-5">
                        <input
                          id="send-now"
                          {...register('schedule')}
                          value="now"
                          type="radio"
                          defaultChecked
                          className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                        />
                      </div>
                      <div className="ml-3 text-sm">
                        <label htmlFor="send-now" className="font-medium text-gray-700">
                          Send immediately
                        </label>
                        <p className="text-gray-500">Start sending messages right away.</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="flex items-center h-5">
                        <input
                          id="schedule-later"
                          {...register('schedule')}
                          value="scheduled"
                          type="radio"
                          className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                        />
                      </div>
                      <div className="ml-3 text-sm">
                        <label htmlFor="schedule-later" className="font-medium text-gray-700">
                          Schedule for later
                        </label>
                        <p className="text-gray-500">Choose a specific date and time.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit buttons */}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => router.push('/campaigns')}
                className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createCampaignMutation.isLoading}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {createCampaignMutation.isLoading ? 'Creating...' : 'Create Campaign'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}