import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

// Export all functions from submodules
export * from './auth';
export * from './gmail';
export * from './scheduled';
export * from './notifications';
