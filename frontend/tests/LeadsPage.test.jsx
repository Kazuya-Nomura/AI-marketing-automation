import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from 'react-query';
import LeadsPage from '../src/pages/leads';
import { api } from '../src/utils/api';

jest.mock('../src/utils/api');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const wrapper = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    {children}
  </QueryClientProvider>
);

describe('LeadsPage', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: '1',
            name: 'Test Lead',
            email: 'test@example.com',
            phone: '1234567890',
            score: 85,
            temperature: 'hot',
            status: 'new'
          }
        ],
        pagination: { page: 1, limit: 10, total: 1 }
      }
    });
  });

  it('renders leads table', async () => {
    render(<LeadsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Test Lead')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
      expect(screen.getByText('hot')).toBeInTheDocument();
    });
  });

  it('opens upload modal on button click', async () => {
    const user = userEvent.setup();
    render(<LeadsPage />, { wrapper });

    const uploadButton = screen.getByText('Upload CSV');
    await user.click(uploadButton);

    expect(screen.getByText('Upload Leads CSV')).toBeInTheDocument();
  });

  it('filters leads by status', async () => {
    const user = userEvent.setup();
    render(<LeadsPage />, { wrapper });

    const filterSelect = screen.getByRole('combobox');
    await user.selectOptions(filterSelect, 'qualified');

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        '/leads',
        expect.objectContaining({
          params: expect.objectContaining({ status: 'qualified' })
        })
      );
    });
  });
});