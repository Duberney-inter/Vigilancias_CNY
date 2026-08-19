import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const QRScanner = ({ onScanSuccess }) => {
    const scannerRef = useRef(null);
    const isStoppingRef = useRef(false);
    const [status, setStatus] = useState('initializing'); // 'initializing', 'active', 'success', 'error'
    const [errorMsg, setErrorMsg] = useState('');

    // V8: UI/UX polished texts
    const TEXTS = {
        initializing: "Sincronizando Hardware de Visión...",
        active: "Escaneando Entorno... Centre el código QR",
        success: "¡ZONA IDENTIFICADA!",
        error: "Conexión Interrumpida"
    };

    const stopAndCleanup = async () => {
        if (isStoppingRef.current) return;
        if (scannerRef.current) {
            isStoppingRef.current = true;
            try {
                if (scannerRef.current.isScanning) {
                    await scannerRef.current.stop();
                }
                // Importante: clear() limpia el DOM inyectado por la librería
                await scannerRef.current.clear();
            } catch (e) {
                console.warn("Cleanup suppression:", e);
            } finally {
                scannerRef.current = null;
                isStoppingRef.current = false;
            }
        }
    };

    const startScanner = async (isMounted) => {
        if (isStoppingRef.current) return;

        setStatus('initializing');
        setErrorMsg('');

        try {
            // Delay para asegurar que el DOM esté listo y el hardware libre
            await new Promise(resolve => setTimeout(resolve, 800));
            if (!isMounted) return;

            const html5QrCode = new Html5Qrcode("v8-scanner-root");
            scannerRef.current = html5QrCode;

            const config = {
                fps: 15,
                // Caja de escaneo proporcional al tamaño real de la cámara (85% del lado
                // menor) en vez de un tamaño fijo: amplía el rango de lectura (códigos más
                // lejos, más pequeños o no perfectamente centrados) en cualquier dispositivo.
                qrbox: (viewfinderWidth, viewfinderHeight) => {
                    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                    const boxSize = Math.floor(minEdge * 0.85);
                    return { width: boxSize, height: boxSize };
                },
                aspectRatio: 1.0
            };

            await html5QrCode.start(
                { facingMode: "environment" },
                config,
                async (decodedText) => {
                    if (isMounted && !isStoppingRef.current) {
                        setStatus('success');
                        // Detenemos ANTES de reportar éxito para liberar el hardware
                        await stopAndCleanup();
                        onScanSuccess(decodedText);
                    }
                },
                () => { } // frames
            );

            if (isMounted) setStatus('active');
        } catch (err) {
            console.error("V8 Scanner Error:", err);
            if (isMounted) {
                setStatus('error');
                setErrorMsg(err.toString().includes("NotAllowedError")
                    ? "Permisos denegados. Active la cámara en ajustes."
                    : "Cámara no disponible o en uso por otra app.");
            }
        }
    };

    useEffect(() => {
        let isMounted = true;
        startScanner(isMounted);

        return () => {
            isMounted = false;
            stopAndCleanup();
        };
    }, []);

    return (
        <div className="scanner-v8-wrapper" style={{ width: '100%', maxWidth: '500px', margin: '0 auto' }}>
            <h2 style={{
                fontSize: '14px',
                textAlign: 'center',
                color: 'var(--color-blue-dark)',
                marginBottom: '15px',
                fontWeight: '800',
                letterSpacing: '1px',
                textTransform: 'uppercase'
            }}>
                Visión de Vigilancia Segura
            </h2>

            <div style={{ position: 'relative', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 15px 35px rgba(0,0,0,0.2)' }}>
                {/* Contenedor del escáner - Se mantiene LIMPIO de elementos React internos */}
                <div id="v8-scanner-root" style={{
                    width: '100%',
                    minHeight: '350px',
                    backgroundColor: '#000'
                }}></div>

                {/* Overlays de UI */}
                {(status === 'initializing' || status === 'success') && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundColor: 'rgba(0,0,0,0.85)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        zIndex: 10,
                        textAlign: 'center',
                        padding: '20px'
                    }}>
                        {status === 'initializing' ? (
                            <>
                                <div className="spinner-v8"></div>
                                <p style={{ marginTop: '20px', fontWeight: '600' }}>{TEXTS.initializing}</p>
                            </>
                        ) : (
                            <>
                                <i className="fas fa-check-circle" style={{ fontSize: '60px', color: '#2ECC71' }}></i>
                                <h3 style={{ marginTop: '20px', color: '#2ECC71', fontWeight: '800' }}>{TEXTS.success}</h3>
                            </>
                        )}
                    </div>
                )}

                {status === 'error' && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundColor: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 11,
                        padding: '30px',
                        textAlign: 'center'
                    }}>
                        <i className="fas fa-video-slash" style={{ fontSize: '40px', color: '#E74C3C', marginBottom: '20px' }}></i>
                        <h4 style={{ margin: '0 0 10px 0', color: '#1a1a1a' }}>{TEXTS.error}</h4>
                        <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>{errorMsg}</p>
                        <button className="btn btn-blue" onClick={() => startScanner(true)} style={{ width: '100%' }}>
                            REINTENTAR CONEXIÓN
                        </button>
                    </div>
                )}
            </div>

            {status === 'active' && (
                <p style={{
                    textAlign: 'center',
                    marginTop: '20px',
                    fontSize: '13px',
                    color: '#555',
                    fontWeight: '600',
                    animation: 'blink 2s infinite'
                }}>
                    <i className="fas fa-bullseye" style={{ color: 'var(--color-blue-primary)' }}></i> {TEXTS.active}
                </p>
            )}

            <style>{`
                .spinner-v8 {
                    width: 40px;
                    height: 40px;
                    border: 4px solid rgba(255,255,255,0.1);
                    border-left-color: var(--color-blue-primary);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
                #v8-scanner-root video {
                    object-fit: cover !important;
                }
            `}</style>
        </div>
    );
};

export default QRScanner;
