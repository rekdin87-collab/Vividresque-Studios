import { Peer } from 'peerjs';

const PEER_OPTIONS = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } };
const CONNECTION_TIMEOUT_MS = 20000;

export class Multiplayer {
    constructor() {
        this.peer = null;
        this.role = 'offline';
        this.connections = new Map();
        this.onMessage = () => {};
        this.onPeerLeave = () => {};
        this.onStatus = () => {};
    }

    createRoom() {
        this.close();
        this.role = 'host';
        return new Promise((resolve, reject) => {
            const peer = this.peer = new Peer(undefined, PEER_OPTIONS);
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                this.close();
                reject(new Error('Room creation timed out. Check your connection and try again.'));
            }, CONNECTION_TIMEOUT_MS);
            const settle = (callback, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                callback(value);
            };
            peer.on('open', id => settle(resolve, id));
            peer.on('connection', connection => {
                connection.on('open', () => {
                    this.connections.set(connection.peer, connection);
                    this._listen(connection);
                    this.onStatus('A wanderer connected.');
                });
                connection.on('close', () => {
                    this.connections.delete(connection.peer);
                    this.onPeerLeave(connection.peer);
                });
                connection.on('error', error => this.onStatus(error.message || 'A player connection failed.'));
            });
            peer.on('error', error => {
                this.onStatus(error.message || 'The room connection failed.');
                if (!settled) settle(reject, error);
            });
            peer.on('disconnected', () => this.onStatus('Room signaling was interrupted; existing player links may still work.'));
        });
    }

    joinRoom(roomId) {
        this.close();
        this.role = 'client';
        return new Promise((resolve, reject) => {
            const peer = this.peer = new Peer(undefined, PEER_OPTIONS);
            const targetId = roomId.trim();
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                this.close();
                reject(new Error('Joining timed out. Check the invite code and try again.'));
            }, CONNECTION_TIMEOUT_MS);
            const settle = (callback, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                callback(value);
            };
            peer.on('open', () => {
                const connection = peer.connect(targetId, { reliable: true });
                this.connections.set(targetId, connection);
                connection.on('open', () => {
                    this._listen(connection);
                    settle(resolve, connection);
                });
                connection.on('error', error => {
                    this.onStatus(error.message || 'Could not reach the host.');
                    if (!settled) settle(reject, error);
                });
                connection.on('close', () => {
                    this.connections.delete(targetId);
                    this.onStatus('Connection to the host was lost.');
                    if (!settled) settle(reject, new Error('The host closed the room before you joined.'));
                });
            });
            peer.on('error', error => {
                this.onStatus(error.message || 'Could not join this room.');
                if (!settled) settle(reject, error);
            });
        });
    }

    _listen(connection) {
        connection.on('data', message => {
            if (message && typeof message.type === 'string') this.onMessage(connection.peer, message, connection);
        });
    }

    send(message) {
        if (this.role === 'client') {
            for (const connection of this.connections.values()) {
                if (connection.open) connection.send(message);
            }
            return;
        }
        if (this.role === 'host') {
            for (const connection of this.connections.values()) {
                if (connection.open) connection.send(message);
            }
        }
    }

    sendTo(peerId, message) {
        const connection = this.connections.get(peerId);
        if (connection?.open) connection.send(message);
    }

    close() {
        for (const connection of this.connections.values()) connection.close();
        this.connections.clear();
        if (this.peer && !this.peer.destroyed) this.peer.destroy();
        this.peer = null;
        this.role = 'offline';
    }
}
