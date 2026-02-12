/**
 * FeedVideoPlayer — Native implementation using react-native-webview.
 *
 * Renders an HTML5 <video> tag inside WKWebView with custom controls:
 * - Play/pause button
 * - Seekable progress bar (tap or drag to scrub)
 * - Current time / duration display
 * - Auto-hiding controls (3s after play, re-appear on tap or pause)
 */

import React, { useCallback, useRef } from 'react'
import { WebView } from 'react-native-webview'
import type { WebViewMessageEvent } from 'react-native-webview'
import { YStack } from 'tamagui'
import { StyleSheet } from 'react-native'

interface FeedVideoPlayerProps {
  uri: string
}

export function FeedVideoPlayer({ uri }: FeedVideoPlayerProps) {
  const webViewRef = useRef<WebView>(null)

  // Listen for messages from the WebView (ended / pause / play)
  const handleMessage = useCallback((_event: WebViewMessageEvent) => {
    // We no longer need to track play state in RN since controls are all in HTML.
    // Messages are still available for future needs (analytics, etc.).
  }, [])

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html, body {
          width: 100%; height: 100%;
          background: #1a1a1a;
          overflow: hidden;
          -webkit-user-select: none;
          user-select: none;
        }

        .player-container {
          position: relative;
          width: 100%; height: 100%;
        }

        video {
          width: 100%; height: 100%;
          object-fit: cover;
          background: #1a1a1a;
          display: block;
        }



        /* ── Controls bar ── */
        .controls {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          background: linear-gradient(transparent, rgba(0,0,0,0.7));
          padding: 12px 12px 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          z-index: 20;
          transition: opacity 0.25s;
        }
        .controls.hidden { opacity: 0; pointer-events: none; }

        .controls-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        /* Play/pause button */
        .ctrl-btn {
          background: none;
          border: none;
          padding: 0;
          width: 28px; height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .ctrl-btn svg { fill: white; width: 20px; height: 20px; }

        /* Progress bar */
        .progress-container {
          flex: 1;
          height: 28px;
          display: flex;
          align-items: center;
          cursor: pointer;
          position: relative;
        }

        .progress-track {
          width: 100%;
          height: 4px;
          background: rgba(255,255,255,0.25);
          border-radius: 2px;
          position: relative;
          overflow: hidden;
        }

        .progress-buffered {
          position: absolute;
          top: 0; left: 0;
          height: 100%;
          background: rgba(255,255,255,0.35);
          border-radius: 2px;
          width: 0%;
        }

        .progress-played {
          position: absolute;
          top: 0; left: 0;
          height: 100%;
          background: #4ade80;
          border-radius: 2px;
          width: 0%;
        }

        /* Thumb indicator */
        .progress-thumb {
          position: absolute;
          top: 50%;
          width: 12px; height: 12px;
          border-radius: 50%;
          background: white;
          transform: translate(-50%, -50%);
          left: 0%;
          box-shadow: 0 0 4px rgba(0,0,0,0.3);
          pointer-events: none;
        }

        /* Expanded hit area during active scrub */
        .progress-container.active .progress-track {
          height: 6px;
        }

        /* Time display */
        .time-display {
          color: rgba(255,255,255,0.85);
          font-family: -apple-system, system-ui, sans-serif;
          font-size: 11px;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
          flex-shrink: 0;
          min-width: 70px;
          text-align: right;
        }

        /* Tap zone fills the video area above controls */
        .tap-zone {
          position: absolute;
          top: 0; left: 0; right: 0;
          bottom: 60px;
          z-index: 5;
        }
      </style>
    </head>
    <body>
      <div class="player-container">
        <video
          id="vid"
          src="${uri}#t=0.5"
          preload="metadata"
          playsinline
          webkit-playsinline
        ></video>



        <!-- Tap zone to show/hide controls -->
        <div class="tap-zone" id="tapZone"></div>

        <!-- Bottom controls bar -->
        <div class="controls" id="controls">
          <div class="controls-row">
            <!-- Play/Pause -->
            <button class="ctrl-btn" id="playBtn" onclick="togglePlay()">
              <svg id="playIcon" viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21"/></svg>
              <svg id="pauseIcon" viewBox="0 0 24 24" style="display:none">
                <rect x="5" y="3" width="4" height="18" rx="1"/>
                <rect x="15" y="3" width="4" height="18" rx="1"/>
              </svg>
            </button>

            <!-- Progress bar -->
            <div class="progress-container" id="progressContainer">
              <div class="progress-track" id="progressTrack">
                <div class="progress-buffered" id="progressBuffered"></div>
                <div class="progress-played" id="progressPlayed"></div>
              </div>
              <div class="progress-thumb" id="progressThumb"></div>
            </div>

            <!-- Time -->
            <div class="time-display" id="timeDisplay">0:00 / 0:00</div>
          </div>
        </div>
      </div>

      <script>
        var vid = document.getElementById('vid');

        var controls = document.getElementById('controls');
        var tapZone = document.getElementById('tapZone');
        var playIcon = document.getElementById('playIcon');
        var pauseIcon = document.getElementById('pauseIcon');
        var progressContainer = document.getElementById('progressContainer');
        var progressPlayed = document.getElementById('progressPlayed');
        var progressBuffered = document.getElementById('progressBuffered');
        var progressThumb = document.getElementById('progressThumb');
        var timeDisplay = document.getElementById('timeDisplay');

        var hideTimer = null;
        var isSeeking = false;

        function fmt(s) {
          if (isNaN(s) || !isFinite(s)) return '0:00';
          var m = Math.floor(s / 60);
          var sec = Math.floor(s % 60);
          return m + ':' + (sec < 10 ? '0' : '') + sec;
        }

        function updateIcons() {
          var playing = !vid.paused && !vid.ended;
          playIcon.style.display = playing ? 'none' : 'block';
          pauseIcon.style.display = playing ? 'block' : 'none';
        }

        function showControls() {
          controls.classList.remove('hidden');
          clearTimeout(hideTimer);
        }

        function scheduleHide() {
          clearTimeout(hideTimer);
          if (!vid.paused && !vid.ended) {
            hideTimer = setTimeout(function() {
              controls.classList.add('hidden');
            }, 3000);
          }
        }

        function togglePlay() {
          if (vid.paused || vid.ended) {
            vid.play();
          } else {
            vid.pause();
          }
        }

        // ── Video events ──
        vid.addEventListener('play', function() {
          updateIcons();
          showControls();
          scheduleHide();
          window.ReactNativeWebView.postMessage('play');
        });

        vid.addEventListener('pause', function() {
          updateIcons();
          showControls();
          clearTimeout(hideTimer);
          window.ReactNativeWebView.postMessage('pause');
        });

        vid.addEventListener('ended', function() {
          updateIcons();
          showControls();
          clearTimeout(hideTimer);
          window.ReactNativeWebView.postMessage('ended');
        });

        vid.addEventListener('timeupdate', function() {
          if (isSeeking) return;
          var pct = vid.duration ? (vid.currentTime / vid.duration) * 100 : 0;
          progressPlayed.style.width = pct + '%';
          progressThumb.style.left = pct + '%';
          timeDisplay.textContent = fmt(vid.currentTime) + ' / ' + fmt(vid.duration);
        });

        vid.addEventListener('progress', function() {
          if (vid.buffered.length > 0) {
            var buffEnd = vid.buffered.end(vid.buffered.length - 1);
            var pct = vid.duration ? (buffEnd / vid.duration) * 100 : 0;
            progressBuffered.style.width = pct + '%';
          }
        });

        vid.addEventListener('loadedmetadata', function() {
          timeDisplay.textContent = '0:00 / ' + fmt(vid.duration);
        });

        // ── Tap zone ──
        tapZone.addEventListener('click', function() {
          if (controls.classList.contains('hidden')) {
            showControls();
            scheduleHide();
          } else {
            togglePlay();
          }
        });

        // ── Progress bar seeking ──
        function seekFromEvent(e) {
          var rect = progressContainer.getBoundingClientRect();
          var clientX = e.touches ? e.touches[0].clientX : e.clientX;
          var pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          vid.currentTime = pct * vid.duration;
          progressPlayed.style.width = (pct * 100) + '%';
          progressThumb.style.left = (pct * 100) + '%';
          timeDisplay.textContent = fmt(vid.currentTime) + ' / ' + fmt(vid.duration);
        }

        progressContainer.addEventListener('touchstart', function(e) {
          e.preventDefault();
          e.stopPropagation();
          isSeeking = true;
          progressContainer.classList.add('active');
          clearTimeout(hideTimer);
          seekFromEvent(e);
        }, { passive: false });

        progressContainer.addEventListener('touchmove', function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (isSeeking) seekFromEvent(e);
        }, { passive: false });

        progressContainer.addEventListener('touchend', function(e) {
          e.preventDefault();
          e.stopPropagation();
          isSeeking = false;
          progressContainer.classList.remove('active');
          scheduleHide();
        }, { passive: false });

        // Mouse events (for simulator testing)
        progressContainer.addEventListener('mousedown', function(e) {
          e.preventDefault();
          e.stopPropagation();
          isSeeking = true;
          progressContainer.classList.add('active');
          clearTimeout(hideTimer);
          seekFromEvent(e);
        });

        document.addEventListener('mousemove', function(e) {
          if (isSeeking) seekFromEvent(e);
        });

        document.addEventListener('mouseup', function() {
          if (isSeeking) {
            isSeeking = false;
            progressContainer.classList.remove('active');
            scheduleHide();
          }
        });

        // Initial state: show controls
        showControls();
      </script>
    </body>
    </html>
  `

  return (
    <YStack width="100%" aspectRatio={16 / 9} overflow="hidden" backgroundColor="#1a1a1a">
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.webview}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled
        originWhitelist={['*']}
        allowsFullscreenVideo={false}
        onMessage={handleMessage}
      />
    </YStack>
  )
}

const styles = StyleSheet.create({
  webview: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a1a',
  },
})
