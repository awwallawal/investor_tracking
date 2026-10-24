import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';

// Helpers for the Evidence library screens (components live in components/EvidenceUi.jsx).

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// File-type icon and tint from the MIME type.
export const fileIcon = (mimeType = '') => {
  if (mimeType === 'application/pdf') return { icon: PictureAsPdfOutlined, color: 'error' };
  if (mimeType.startsWith('image/')) return { icon: ImageOutlined, color: 'accent' };
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return { icon: TableChartOutlined, color: 'success' };
  return { icon: DescriptionOutlined, color: 'accent' };
};
