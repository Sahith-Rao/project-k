import cv2
import numpy as np
from deepface import DeepFace
from moviepy.editor import VideoFileClip, AudioFileClip
import speech_recognition as sr
import os
from collections import defaultdict
import math
import sys
import json
import logging
import contextlib
import io

# Suppress MoviePy output
logging.getLogger('moviepy').setLevel(logging.ERROR)

class HRFeedbackGenerator:
    def __init__(self, video_path):
        self.video_path = video_path
        self.feedback = {
            'eye_contact': 0,
            'facial_expressions': defaultdict(float),
            'confidence_score': 0,
            'speech_clarity': 0,
            'pauses': 0,
            'filler_words': 0,
            'speech_rate': 0  # words per minute
        }

    def _extract_audio(self):
        """Extract audio from video for speech analysis"""
        temp_audio = "temp_audio.wav"
        try:
            # Redirect stdout to suppress MoviePy output
            with contextlib.redirect_stdout(io.StringIO()):
                video = VideoFileClip(self.video_path)
                video.audio.write_audiofile(temp_audio, verbose=False)
            return temp_audio
        except Exception as e:
            print(json.dumps({"error": f"Error extracting audio: {str(e)}"}))
            sys.exit(1)

    def _detect_silence(self, audio_clip, silence_thresh=-40, min_silence_duration=1.0):
        """Detect silent periods in audio using numpy arrays"""
        try:
            # Get the audio data as a numpy array
            audio_array = audio_clip.to_soundarray()
            
            # Convert to mono if stereo
            if len(audio_array.shape) > 1:
                audio_array = audio_array.mean(axis=1)
            
            # Calculate RMS values
            frame_length = int(audio_clip.fps * 0.1)  # 100ms frames
            rms_values = []
            
            for i in range(0, len(audio_array), frame_length):
                frame = audio_array[i:i + frame_length]
                if len(frame) > 0:
                    rms = np.sqrt(np.mean(np.square(frame)))
                    db = 20 * np.log10(rms) if rms > 0 else -100
                    rms_values.append(db)
            
            # Find silent regions
            silent_ranges = []
            current_start = None
            
            for i, db in enumerate(rms_values):
                time = i * 0.1  # Convert frame index to time
                
                if db < silence_thresh:
                    if current_start is None:
                        current_start = time
                else:
                    if current_start is not None:
                        if time - current_start >= min_silence_duration:
                            silent_ranges.append((current_start, time))
                        current_start = None
            
            # Handle case where audio ends in silence
            if current_start is not None:
                if audio_clip.duration - current_start >= min_silence_duration:
                    silent_ranges.append((current_start, audio_clip.duration))
            
            return silent_ranges
            
        except Exception as e:
            print(json.dumps({"error": f"Error detecting silence: {str(e)}"}))
            return []

    def _analyze_speech(self, audio_path):
        """Analyze speech patterns without content analysis"""
        r = sr.Recognizer()
        try:
            with sr.AudioFile(audio_path) as source:
                audio = r.record(source)

                try:
                    text = r.recognize_google(audio)
                    words = text.lower().split()

                    # Count filler words
                    filler_words = ['um', 'uh', 'ah', 'like', 'you know']
                    self.feedback['filler_words'] = sum(1 for word in words if word in filler_words)

                    # Calculate speech rate
                    with contextlib.redirect_stdout(io.StringIO()):
                        duration = VideoFileClip(self.video_path).duration
                    if duration > 0:
                        words_per_minute = (len(words) / duration) * 60
                        self.feedback['speech_rate'] = words_per_minute
                        # Speech clarity based on ideal 110-150 WPM range
                        if 110 <= words_per_minute <= 150:
                            self.feedback['speech_clarity'] = 1.0
                        else:
                            self.feedback['speech_clarity'] = 1 - min(abs(words_per_minute - 130)/80, 1)

                    # Detect long pauses (>1 second)
                    with contextlib.redirect_stdout(io.StringIO()):
                        audio_clip = AudioFileClip(audio_path)
                        silent_ranges = self._detect_silence(audio_clip)
                    self.feedback['pauses'] = len([r for r in silent_ranges if r[1]-r[0] > 1.0])

                except Exception as e:
                    print(json.dumps({"error": f"Speech recognition error: {str(e)}"}))
                    self.feedback['speech_clarity'] = 0.5
                finally:
                    if os.path.exists(audio_path):
                        os.remove(audio_path)
        except Exception as e:
            print(json.dumps({"error": f"Error analyzing speech: {str(e)}"}))
            sys.exit(1)

    def _analyze_facial_features(self):
        """Analyze facial expressions and eye contact"""
        try:
            cap = cv2.VideoCapture(self.video_path)
            frame_interval = max(1, int(cap.get(cv2.CAP_PROP_FPS) // 3))  # Sample 3 frames per second

            total_frames = 0
            eye_contact_frames = 0
            emotion_counts = defaultdict(int)

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                total_frames += 1
                if total_frames % frame_interval != 0:
                    continue

                try:
                    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    analysis = DeepFace.analyze(rgb_frame, actions=['emotion'], enforce_detection=False)

                    if isinstance(analysis, list):
                        analysis = analysis[0]

                    if 'emotion' in analysis:
                        dominant_emotion = max(analysis['emotion'].items(), key=lambda x: x[1])[0]
                        emotion_counts[dominant_emotion] += 1

                    if 'region' in analysis:
                        x, y, w, h = analysis['region']['x'], analysis['region']['y'], analysis['region']['w'], analysis['region']['h']
                        # Simple eye contact heuristic (face position in frame)
                        if 0.35 < x/(frame.shape[1]-w) < 0.65:
                            eye_contact_frames += 1

                except Exception as e:
                    continue

            cap.release()

            # Calculate metrics
            if total_frames > 0:
                self.feedback['eye_contact'] = eye_contact_frames / (total_frames / frame_interval)

            total_emotion_frames = sum(emotion_counts.values())
            if total_emotion_frames > 0:
                for emotion, count in emotion_counts.items():
                    self.feedback['facial_expressions'][emotion] = count / total_emotion_frames

            # Confidence score based on positive expressions
            positive_emotions = ['happy', 'neutral']
            self.feedback['confidence_score'] = sum(
                self.feedback['facial_expressions'].get(emotion, 0)
                for emotion in positive_emotions
            )
        except Exception as e:
            print(json.dumps({"error": f"Error analyzing facial features: {str(e)}"}))
            sys.exit(1)

    def generate_feedback(self):
        """Generate delivery-focused feedback"""
        try:
            # Analyze facial features
            self._analyze_facial_features()

            # Analyze speech patterns
            audio_path = self._extract_audio()
            self._analyze_speech(audio_path)

            return self._format_feedback()
        except Exception as e:
            print(json.dumps({"error": f"Error generating feedback: {str(e)}"}))
            sys.exit(1)

    def _format_feedback(self):
        """Format the feedback for delivery metrics only"""
        try:
            # Calculate overall delivery score
            weights = {
                'eye_contact': 0.3,
                'confidence_score': 0.3,
                'speech_clarity': 0.2,
                'filler_words': -0.1,
                'pauses': -0.1
            }

            filler_score = max(0, 1 - (self.feedback['filler_words'] / 10))
            pause_score = max(0, 1 - (self.feedback['pauses'] / 5))

            overall_score = (
                weights['eye_contact'] * self.feedback['eye_contact'] +
                weights['confidence_score'] * self.feedback['confidence_score'] +
                weights['speech_clarity'] * self.feedback['speech_clarity'] +
                weights['filler_words'] * filler_score +
                weights['pauses'] * pause_score
            )

            overall_score = max(0, min(1, overall_score)) * 100

            # Generate feedback comments
            comments = []

            # Eye contact feedback
            eye_contact_percent = self.feedback['eye_contact'] * 100
            if eye_contact_percent < 30:
                comments.append("Poor eye contact ({}%) - practice looking directly at the camera".format(int(eye_contact_percent)))
            elif eye_contact_percent < 60:
                comments.append("Moderate eye contact ({}%) - could be more consistent".format(int(eye_contact_percent)))
            else:
                comments.append("Excellent eye contact ({}%)".format(int(eye_contact_percent)))

            # Confidence feedback
            if self.feedback['confidence_score'] < 0.4:
                comments.append("Low confidence detected - work on posture and voice projection")
            elif self.feedback['confidence_score'] < 0.7:
                comments.append("Moderate confidence - could project more authority")
            else:
                comments.append("High confidence detected - good presence")

            # Speech metrics
            comments.append("Speech rate: {:.1f} words/minute (ideal: 110-150)".format(self.feedback['speech_rate']))
            comments.append("Filler words used: {}".format(self.feedback['filler_words']))
            comments.append("Long pauses (>1s): {}".format(self.feedback['pauses']))

            # Emotion feedback
            dominant_emotion = max(
                self.feedback['facial_expressions'].items(),
                key=lambda x: x[1]
            )[0] if self.feedback['facial_expressions'] else 'neutral'
            comments.append("Dominant facial expression: {}".format(dominant_emotion))

            return {
                'overall_score': round(overall_score, 1),
                'detailed_metrics': {
                    'eye_contact': round(self.feedback['eye_contact'] * 100, 1),
                    'confidence': round(self.feedback['confidence_score'] * 100, 1),
                    'speech_clarity': round(self.feedback['speech_clarity'] * 100, 1),
                    'speech_rate': round(self.feedback['speech_rate'], 1),
                    'filler_words': self.feedback['filler_words'],
                    'long_pauses': self.feedback['pauses'],
                    'dominant_emotion': dominant_emotion
                },
                'feedback_comments': comments
            }
        except Exception as e:
            print(json.dumps({"error": f"Error formatting feedback: {str(e)}"}))
            sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No video path provided"}))
        sys.exit(1)

    video_path = sys.argv[1]
    analyzer = HRFeedbackGenerator(video_path)
    feedback = analyzer.generate_feedback()
    
    # Print JSON output for the backend to capture
    print(json.dumps(feedback))