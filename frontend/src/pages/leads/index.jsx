import { useState, useCallback } from 'react';
import { useQuery, useMutation } from 'react-query';
import { useDropzone } from 'react-dropzone';
import Layout from '../../components/Layout';
import { api } from '../../utils/api';

export default function LeadsPage() {
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Fetch leads
  const { data: leads, isLoading, refetch } = useQuery(
    ['leads', filterStatus],
    () => api.get('/leads', { params: { status: filterStatus } }),
    {
      refetchInterval: 30000 // Refresh every 30 seconds
    }
  );

  // Upload mutation
  const uploadMutation = useMutation(
    (file) => {
      const formData = new FormData();
      formData.append('csv', file);
      return api.post('/leads/bulk-upload', formData);
    },
    {
      onSuccess: () => {
        refetch();
        setShowUploadModal(false);
      }
    }
  );

  // Dropzone config
  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      uploadMutation.mutate(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv']
    },
    maxFiles: 1
  });

  const handleBulkAction = async (action) => {
    if (selectedLeads.length === 0) return;

    try {
      await api.post(`/leads/bulk-${action}`, {
        leadIds: selectedLeads
      });
      refetch();
      setSelectedLeads([]);
    } catch (error) {
      console.error(`Bulk ${action} error:`, error);
    }
  };

  return (
    <Layout>
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <h1 className="text-2xl font-semibold text-gray-900">Leads Management</h1>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          {/* Actions bar */}
          <div className="mt-4 flex justify-between items-center">
            <div className="flex space-x-3">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
              >
                <option value="all">All Leads</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="converted">Converted</option>
              </select>
              
              {selectedLeads.length > 0 && (
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleBulkAction('message')}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                  >
                    Send Message ({selectedLeads.length})
                  </button>
                  <button
                    onClick={() => handleBulkAction('nurture')}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Add to Campaign
                  </button>
                </div>
              )}
            </div>
            
            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Upload CSV
            </button>
          </div>

          {/* Leads table */}
          <div className="mt-8 flex flex-col">
            <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
                <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedLeads(leads?.data?.data?.map(l => l.id) || []);
                              } else {
                                setSelectedLeads([]);
                              }
                            }}
                          />
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Name
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Contact
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Score
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Temperature
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Status
                        </th>
                        <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {leads?.data?.data?.map((lead) => (
                        <tr key={lead.id}>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            <input
                              type="checkbox"
                              checked={selectedLeads.includes(lead.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedLeads([...selectedLeads, lead.id]);
                                } else {
                                  setSelectedLeads(selectedLeads.filter(id => id !== lead.id));
                                }
                              }}
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            />
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">
                            {lead.name}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            <div>{lead.email}</div>
                            <div>{lead.phone}</div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            <div className="flex items-center">
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">{lead.score}</div>
                                <div className="text-sm text-gray-500">AI Score</div>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            <span className={`inline-flex px-2 text-xs font-semibold leading-5 rounded-full
                              ${lead.temperature === 'hot' ? 'bg-red-100 text-red-800' : ''}
                              ${lead.temperature === 'warm' ? 'bg-yellow-100 text-yellow-800' : ''}
                              ${lead.temperature === 'cold' ? 'bg-blue-100 text-blue-800' : ''}
                            `}>
                              {lead.temperature}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {lead.status}
                          </td>
                          <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                            <a href={`/leads/${lead.id}`} className="text-indigo-600 hover:text-indigo-900">
                              View
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Upload Leads CSV
                </h3>
                
                <div className="mt-4">
                  <div {...getRootProps()} className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 cursor-pointer">
                    <input {...getInputProps()} />
                    {isDragActive ? (
                      <p>Drop the CSV file here...</p>
                    ) : (
                      <div>
                        <p>Drag and drop a CSV file here, or click to select</p>
                        <p className="text-xs text-gray-500 mt-2">
                          CSV should contain: name, email, phone, budget, location
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}