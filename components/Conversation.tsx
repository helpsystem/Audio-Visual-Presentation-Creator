import React from 'react';
import { useGeminiLive } from '../hooks/useGeminiLive';
import { ConnectionState, ConversationRole } from '../types';
import AudioVisualizer from './AudioVisualizer';

const StartIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
    <path d="M7.5 3.75H6A2.25 2.25 0 0 0 3.75 6v1.5h1.5v-1.5a.75.75 0 0 1 .75-.75h1.5v-1.5Zm9.75 0h1.5a.75.75 0 0 1 .75.75V6h1.5V6A2.25 2.25 0 0 0 18 3.75h-1.5v-1.5ZM12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5ZM10.5 12a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" />
    <path fillRule="evenodd" d="M4.5 9.75A.75.75 0 0 1 5.25 9h13.5a.75.75 0 0 1 0 1.5H5.25a.75.75 0 0 1-.75-.75Zm0 4.5a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H5.25a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
  </svg>
);

const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
    <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
  </svg>
);

const Conversation: React.FC = () => {
  const { connectionState, transcript, analyserNode, startSession, closeSession, errorMessage } = useGeminiLive();

  const isSessionActive = connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING;

  const getStatusText = () => {
    if (connectionState === ConnectionState.ERROR && errorMessage) {
      return errorMessage;
    }
    switch (connectionState) {
      case ConnectionState.IDLE: return "Ready to start";
      case ConnectionState.CONNECTING: return "Connecting...";
      case ConnectionState.CONNECTED: return "Connected. Start speaking.";
      case ConnectionState.CLOSING: return "Disconnecting...";
      case ConnectionState.CLOSED: return "Session ended. Click to start again.";
      case ConnectionState.ERROR: return "Connection error. Please try again.";
      default: return "Ready";
    }
  };
  
  const getStatusColor = () => {
    switch (connectionState) {
        case ConnectionState.CONNECTING: return "text-yellow-400";
        case ConnectionState.CONNECTED: return "text-green-400";
        case ConnectionState.ERROR: return "text-red-400";
        default: return "text-gray-400";
    }
  };

  return (
    <div className="flex flex-col h-[70vh]">
      <div className="flex-grow p-4 md:p-6 overflow-y-auto bg-gray-800/50">
        <div className="space-y-4">
          {transcript.length === 0 && (
            <div className="text-center text-gray-500 pt-16">
              <p>Your conversation will appear here.</p>
            </div>
          )}
          {transcript.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-start gap-3 ${entry.role === ConversationRole.USER ? 'justify-end' : 'justify-start'}`}
            >
              {entry.role === ConversationRole.MODEL && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 flex-shrink-0"></div>
              )}
              <div
                className={`max-w-xl p-3 rounded-xl ${entry.role === ConversationRole.USER
                    ? 'bg-blue-600 rounded-br-none'
                    : 'bg-gray-700 rounded-bl-none'
                  }`}
              >
                <p className="text-white">{entry.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-shrink-0 bg-gray-800 border-t border-gray-700 p-4 space-y-4">
         <div className="h-20 flex items-center justify-center">
            <AudioVisualizer analyserNode={analyserNode} isActive={isSessionActive} />
         </div>
        <div className="flex items-center justify-center space-x-4">
          <button
            onClick={isSessionActive ? closeSession : startSession}
            disabled={connectionState === ConnectionState.CONNECTING || connectionState === ConnectionState.CLOSING}
            className={`p-4 rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-opacity-50
              ${isSessionActive
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
              }
              disabled:bg-gray-500 disabled:cursor-not-allowed`}
          >
            {isSessionActive ? <StopIcon /> : <StartIcon />}
          </button>
          <p className={`text-center font-medium ${getStatusColor()}`}>{getStatusText()}</p>
        </div>
      </div>
    </div>
  );
};

export default Conversation;