import type { Meta, StoryObj } from '@storybook/vue3';
import Inspector from './Inspector.vue';

const meta: Meta<typeof Inspector> = {
  component: Inspector,
  args: {
    annotation: {
      id: 'rect-1',
      type: 'rect',
      x: 120,
      y: 80,
      w: 320,
      h: 180,
      color: '#ef4444',
      strokeWidth: 3,
    },
    screenshot: {
      id: 'shot',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceUrl: 'https://example.test',
      pageTitle: 'Example page',
      filename: 'shot.png',
      contentType: 'image/png',
      width: 1440,
      height: 900,
      sizeBytes: 12000,
      annotations: [],
      imageUrl: '/placeholder.png',
      pageUrl: '/screenshot/shot',
    },
    annotationCount: 3,
  },
};

export default meta;
type Story = StoryObj<typeof Inspector>;

export const Rectangle: Story = {};
