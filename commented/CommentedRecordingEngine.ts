/**
 * Handle media play events
 */
// private handleMediaPlayEvent(eventData: any): void {
//   if (!eventData.target) return;
  
//   const target = eventData.target;
//   const elementContext = this.convertNativeElementToElementContext(target);
  
//   const action: SemanticAction = {
//     id: this.generateId(),
//     type: ActionType.MEDIA_PLAY,
//     timestamp: eventData.timestamp || Date.now(),
//     description: `Started playing media ${elementContext.description || target.tagName}`,
//     target: elementContext,
//     value: eventData.mediaInfo ? JSON.stringify(eventData.mediaInfo) : undefined,
//     context: {
//       url: eventData.url,
//       title: eventData.title || 'Unknown Page',
//       timestamp: eventData.timestamp || Date.now(),
//       viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
//       userAgent: navigator.userAgent,
//       keyElements: []
//     },
//     intent: 'play_media'
//   };
  
//   this.recordAction(action);
// }

/**
 * Handle media pause events
 */
// private handleMediaPauseEvent(eventData: any): void {
//   if (!eventData.target) return;
  
//   const target = eventData.target;
//   const elementContext = this.convertNativeElementToElementContext(target);
  
//   const action: SemanticAction = {
//     id: this.generateId(),
//     type: ActionType.MEDIA_PAUSE,
//     timestamp: eventData.timestamp || Date.now(),
//     description: `Paused media ${elementContext.description || target.tagName}`,
//     target: elementContext,
//     value: eventData.mediaInfo ? JSON.stringify(eventData.mediaInfo) : undefined,
//     context: {
//       url: eventData.url,
//       title: eventData.title || 'Unknown Page',
//       timestamp: eventData.timestamp || Date.now(),
//       viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
//       userAgent: navigator.userAgent,
//       keyElements: []
//     },
//     intent: 'pause_media'
//   };
  
//   this.recordAction(action);
// }

/**
 * Handle media ended events
 */
// private handleMediaEndedEvent(eventData: any): void {
//   if (!eventData.target) return;
  
//   const target = eventData.target;
//   const elementContext = this.convertNativeElementToElementContext(target);
  
//   const action: SemanticAction = {
//     id: this.generateId(),
//     type: ActionType.MEDIA_ENDED,
//     timestamp: eventData.timestamp || Date.now(),
//     description: `Media playback ended for ${elementContext.description || target.tagName}`,
//     target: elementContext,
//     value: eventData.mediaInfo ? JSON.stringify(eventData.mediaInfo) : undefined,
//     context: {
//       url: eventData.url,
//       title: eventData.title || 'Unknown Page',
//       timestamp: eventData.timestamp || Date.now(),
//       viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
//       userAgent: navigator.userAgent,
//       keyElements: []
//     },
//     intent: 'complete_media'
//   };
  
//   this.recordAction(action);
// }

/**
 * Handle touch events
 */
// private handleTouchEvent(eventData: any): void {
//   if (!eventData.target) return;
  
//   const target = eventData.target;
//   const elementContext = this.convertNativeElementToElementContext(target);
  
//   let actionType: ActionType;
//   let description: string;
//   let intent: string;
  
//   switch (eventData.type) {
//     case 'touch_start':
//       actionType = ActionType.TOUCH_START;
//       description = `Touch started on ${elementContext.description || target.tagName}`;
//       intent = 'touch_interact';
//       break;
//     case 'touch_end':
//       actionType = ActionType.TOUCH_END;
//       description = `Touch ended on ${elementContext.description || target.tagName}`;
//       intent = 'touch_interact';
//       break;
//     case 'touch_move':
//       actionType = ActionType.TOUCH_MOVE;
//       description = `Touch moved on ${elementContext.description || target.tagName}`;
//       intent = 'touch_interact';
//       break;
//     default:
//       actionType = ActionType.TOUCH_START;
//       description = `Touch interaction with ${elementContext.description || target.tagName}`;
//       intent = 'touch_interact';
//   }
  
//   const action: SemanticAction = {
//     id: this.generateId(),
//     type: actionType,
//     timestamp: eventData.timestamp || Date.now(),
//     description,
//     target: elementContext,
//     coordinates: eventData.coordinates,
//     context: {
//       url: eventData.url,
//       title: eventData.title || 'Unknown Page',
//       timestamp: eventData.timestamp || Date.now(),
//       viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
//       userAgent: navigator.userAgent,
//       keyElements: []
//     },
//     intent
//   };
  
//   // Only record significant touch events
//   if (this.shouldRecordAction(action)) {
//     this.recordAction(action);
//   }
// }


/**
//  * Handle async request start events
//  */
// private handleAsyncRequestStartEvent(eventData: any): void {
//   if (!eventData.request) return;
  
//   const action: SemanticAction = {
//     id: this.generateId(),
//     type: ActionType.NETWORK_REQUEST,
//     timestamp: eventData.timestamp || Date.now(),
//     description: `Started async request to ${eventData.request.url || 'unknown endpoint'}`,
//     target: {
//       description: `${eventData.request.method || 'GET'} request to ${eventData.request.url || 'unknown endpoint'}`,
//       selector: '',
//       xpath: '',
//       role: 'network_request',
//       isVisible: false,
//       isInteractive: false,
//       context: 'network'
//     },
//     value: eventData.request,
//     context: {
//       url: eventData.url,
//       title: eventData.title || 'Unknown Page',
//       timestamp: eventData.timestamp || Date.now(),
//       viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
//       userAgent: navigator.userAgent,
//       keyElements: []
//     },
//     intent: 'fetch_data'
//   };
  
//   this.recordAction(action);
// }

// /**
//  * Handle async request complete events
//  */
// private handleAsyncRequestCompleteEvent(eventData: any): void {
//   if (!eventData.request) return;
  
//   const action: SemanticAction = {
//     id: this.generateId(),
//     type: ActionType.NETWORK_REQUEST,
//     timestamp: eventData.timestamp || Date.now(),
//     description: `Completed async request to ${eventData.request.url || 'unknown endpoint'} (${eventData.request.status || 'unknown status'})`,
//     target: {
//       description: `${eventData.request.method || 'GET'} request to ${eventData.request.url || 'unknown endpoint'}`,
//       selector: '',
//       xpath: '',
//       role: 'network_request',
//       isVisible: false,
//       isInteractive: false,
//       context: 'network'
//     },
//     value: eventData.request,
//     context: {
//       url: eventData.url,
//       title: eventData.title || 'Unknown Page',
//       timestamp: eventData.timestamp || Date.now(),
//       viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
//       userAgent: navigator.userAgent,
//       keyElements: []
//     },
//     intent: 'receive_data'
//   };
  
//   this.recordAction(action);
// }

// /**
//  * Handle async request error events
//  */
// private handleAsyncRequestErrorEvent(eventData: any): void {
//   if (!eventData.request) return;
  
//   const action: SemanticAction = {
//     id: this.generateId(),
//     type: ActionType.NETWORK_REQUEST,
//     timestamp: eventData.timestamp || Date.now(),
//     description: `Error in async request to ${eventData.request.url || 'unknown endpoint'}`,
//     target: {
//       description: `${eventData.request.method || 'GET'} request to ${eventData.request.url || 'unknown endpoint'}`,
//       selector: '',
//       xpath: '',
//       role: 'network_request',
//       isVisible: false,
//       isInteractive: false,
//       context: 'network'
//     },
//     value: eventData.request,
//     context: {
//       url: eventData.url,
//       title: eventData.title || 'Unknown Page',
//       timestamp: eventData.timestamp || Date.now(),
//       viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
//       userAgent: navigator.userAgent,
//       keyElements: []
//     },
//     intent: 'handle_error'