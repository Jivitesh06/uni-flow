// Firebase Messaging Service Worker for UniFlow
// Used when Firebase Cloud Messaging is active
// Imports the central push and notificationclick handler without duplicating event listeners
importScripts('/sw-push-handler.js');
