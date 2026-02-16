import { RuntimeKernel } from './build/kernel/kernel';

// Start the runtime kernel with options
const options = {
  skipLogin: process.argv.includes('--skip-login'),
  autoLoginUser: process.argv.find(arg => arg.startsWith('--auto-login='))?.split('=')[1]
};

const runtime = new RuntimeKernel(options);
runtime.start(); 