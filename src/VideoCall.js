import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:4000'); 

const generateKey = () => {
    return Math.random().toString(36).substr(2, 8); // Generates an 8-character random string
};

const VideoCall = () => {
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const viewerVideoRef = useRef(null); // Reference for viewer's video
    const peerConnectionRef = useRef(null);
    const localStreamRef = useRef(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isCallActive, setIsCallActive] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [recognition, setRecognition] = useState(null);
    const [viewerKey, setViewerKey] = useState('');
    const [isViewer, setIsViewer] = useState(false); // State to check if the user is a viewer
    const [callKey, setCallKey] = useState(''); // State to hold the generated call key

    useEffect(() => {
        const getMediaStream = async () => {
            localStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideoRef.current.srcObject = localStreamRef.current;

            // Create a new peer connection
            peerConnectionRef.current = new RTCPeerConnection();
            localStreamRef.current.getTracks().forEach(track => peerConnectionRef.current.addTrack(track, localStreamRef.current));

            peerConnectionRef.current.onicecandidate = event => {
                if (event.candidate) {
                    socket.emit('signal', { to: null, signal: event.candidate }); // Change this to send to the correct ID
                }
            };

            peerConnectionRef.current.ontrack = event => {
                if (isViewer) {
                    viewerVideoRef.current.srcObject = event.streams[0]; // Set the viewer's video ref to the incoming stream
                } else {
                    remoteVideoRef.current.srcObject = event.streams[0]; // Set the remote video ref for the caller
                }
            };
        };

        if (isCallActive) {
            getMediaStream();
            call(); // Start the call
            startSpeechRecognition(); // Start speech recognition when the call is active
        } else {
            // Clean up if the call is not active
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
                peerConnectionRef.current = null;
            }
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = null; // Clear remote video
            }
            if (viewerVideoRef.current) {
                viewerVideoRef.current.srcObject = null; // Clear viewer video
            }
            stopSpeechRecognition(); // Stop speech recognition when the call is inactive
        }

        socket.on('signal', async (data) => {
            if (data.signal.sdp) {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.signal));
                if (data.signal.type === 'offer') {
                    const answer = await peerConnectionRef.current.createAnswer();
                    await peerConnectionRef.current?.setLocalDescription(answer);
                    socket.emit('signal', { to: data.from, signal: answer });
                }
            } else if (data.signal.candidate) {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.signal));
            }
        });

        return () => {
            socket.off('signal');
            stopSpeechRecognition(); // Clean up speech recognition
        };
    }, [isCallActive, isViewer]); // Make sure to include isViewer in dependencies

    const call = async () => {
        const offer = await peerConnectionRef.current?.createOffer();
        await peerConnectionRef.current?.setLocalDescription(offer);
        socket.emit('signal', { to: null, signal: offer }); // Send the offer to the server
    };

    const handleMute = () => {
        localStreamRef.current.getAudioTracks().forEach(track => {
            track.enabled = !isMuted; // Set enabled to false if muted, true otherwise
        });

        if (!isMuted) {
            stopSpeechRecognition();
        } else {
            startSpeechRecognition();
        }

        setIsMuted(prev => !prev); // Update muted state
    };

    const handleToggleCall = () => {
        if (!isCallActive) {
            const key = generateKey(); // Generate a new key when starting the call
            setCallKey(key); // Set the generated key to state
            socket.emit('start-call', key); // Emit start-call event with the key
        }
        setIsCallActive(prev => !prev);
    };

    const startSpeechRecognition = () => {
        if (!('webkitSpeechRecognition' in window)) {
            alert("Your browser does not support speech recognition.");
            return;
        }

        const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
        const recognitionInstance = new SpeechRecognition();
        recognitionInstance.continuous = true;
        recognitionInstance.interimResults = true;

        recognitionInstance.onresult = event => {
            const currentTranscript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');
            setTranscript(currentTranscript);
        };

        recognitionInstance.onerror = event => {
            console.error("Speech recognition error:", event.error);
        };

        recognitionInstance.start();
        setRecognition(recognitionInstance);
    };

    const stopSpeechRecognition = () => {
        if (recognition) {
            recognition.stop();
            setRecognition(null);
        }
    };

    const handleViewerJoin = () => {
        // Emit a join event with the viewer key for the specific user
        socket.emit('join-viewer', { key: viewerKey });
        setIsViewer(true);
    };

    const handleKeyChange = (e) => {
        setViewerKey(e.target.value);
    };

    return (
        <div className="container">
            <h2 className="header">Streamer App</h2>
            <div style={{ padding: '10px 0' }}>
                {isCallActive && callKey && (
                    <div>
                        <h4>Call Key: {callKey}</h4>
                    </div>
                )}
            </div>
            <div className="video-container">
                <video ref={localVideoRef} autoPlay muted />
                
            </div>
            
            <div className="button-container">
                
                <button className="button" onClick={handleToggleCall}>
                    {isCallActive ? 'Stop Video Call' : 'Start Video Call'}
                </button>
            </div>
        </div>
    );
};

export default VideoCall;