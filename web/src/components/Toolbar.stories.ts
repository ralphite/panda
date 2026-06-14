import type { Meta, StoryObj } from '@storybook/vue3';
import Toolbar from './Toolbar.vue';

const meta: Meta<typeof Toolbar> = {
  component: Toolbar,
  args: {
    tool: 'rect',
    color: '#ef4444',
    strokeWidth: 3,
    zoom: 1,
    activeTitle: 'Checkout page',
    canExport: true,
  },
};

export default meta;
type Story = StoryObj<typeof Toolbar>;

export const Default: Story = {};

