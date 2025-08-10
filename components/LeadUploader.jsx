import React, { useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';

const LeadUploader = () => {
  const [uploadStep, setUploadStep] = useState('upload'); // upload, mapping, preview, complete
  const [fileData, setFileData] = useState(null);
  const [mappings, setMappings] = useState({});

  const systemFields = [
    { id: 'email', label: 'Email Address', required: true },
    { id: 'phone', label: 'Phone Number', required: true },
    { id: 'firstName', label: 'First Name', required: false },
    { id: 'lastName', label: 'Last Name', required: false },
    { id: 'company', label: 'Company', required: false },
    { id: 'tags', label: 'Tags', required: false }
  ];

  const handleFileUpload = async (file) => {
    // Parse CSV/JSON
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target.result;
      const parsed = await parseFile(file, content);
      setFileData(parsed);
      setUploadStep('mapping');
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {['Upload', 'Map Fields', 'Preview', 'Import'].map((step, idx) => (
            <div key={step} className="flex items-center">
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center
                ${uploadStep === step.toLowerCase() ? 'bg-indigo-600 text-white' : 'bg-gray-200'}
              `}>
                {idx + 1}
              </div>
              <span className="ml-2 text-sm font-medium">{step}</span>
              {idx < 3 && <div className="w-20 h-1 bg-gray-200 ml-4" />}
            </div>
          ))}
        </div>
      </div>

      {/* Upload Step */}
      {uploadStep === 'upload' && (
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-6">Upload Lead Data</h2>
          
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg mb-2">Drop your CSV or JSON file here</p>
            <p className="text-sm text-gray-600 mb-4">or click to browse</p>
            <input
              type="file"
              accept=".csv,.json"
              onChange={(e) => handleFileUpload(e.target.files[0])}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg cursor-pointer hover:bg-indigo-700"
            >
              Select File
            </label>
          </div>

          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="ml-3">
                <p className="text-sm font-medium text-blue-900">File Requirements</p>
                <ul className="text-sm text-blue-700 mt-1 list-disc list-inside">
                  <li>CSV files must have headers in the first row</li>
                  <li>JSON files must be an array of objects</li>
                  <li>Required fields: Email and/or Phone Number</li>
                  <li>Maximum file size: 10MB</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Field Mapping Step */}
      {uploadStep === 'mapping' && fileData && (
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-6">Map Your Fields</h2>
          <p className="text-gray-600 mb-6">
            Match your file columns to Fine Acers fields
          </p>

          <div className="space-y-4">
            {systemFields.map((field) => (
              <div key={field.id} className="flex items-center space-x-4">
                <div className="w-1/3">
                  <label className="block text-sm font-medium text-gray-700">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                </div>
                <div className="w-2/3">
                  <select
                    value={mappings[field.id] || ''}
                    onChange={(e) => setMappings({
                      ...mappings,
                      [field.id]: e.target.value
                    })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Select Column --</option>
                    {fileData.headers.map((header) => (
                      <option key={header} value={header}>
                        {header} (Sample: {fileData.sample[header]})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-between">
            <button
              onClick={() => setUploadStep('upload')}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Back
            </button>
            <button
              onClick={() => setUploadStep('preview')}
              disabled={!mappings.email && !mappings.phone}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Preview Import
            </button>
          </div>
        </div>
      )}
    </div>
  );
};