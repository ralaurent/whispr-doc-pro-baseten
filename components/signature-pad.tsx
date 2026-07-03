//signature-pad.tsx
'use client';

import React, { useRef, useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import SignaturePad from 'signature_pad';
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

const trimCanvas = (canvas: HTMLCanvasElement): string | null => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const width = canvas.width;
    const height = canvas.height;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    let minX = width, minY = height, maxX = 0, maxY = 0;
    let found = false;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
            }
        }
    }

    if (!found) return null;

    const padding = 4;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(width, maxX + padding);
    maxY = Math.min(height, maxY + padding);

    const trimmedWidth = maxX - minX;
    const trimmedHeight = maxY - minY;

    const copy = document.createElement('canvas');
    copy.width = trimmedWidth;
    copy.height = trimmedHeight;
    const copyCtx = copy.getContext('2d');

    if (!copyCtx) return null;

    copyCtx.drawImage(
        canvas,
        minX, minY, trimmedWidth, trimmedHeight,
        0, 0, trimmedWidth, trimmedHeight
    );

    return copy.toDataURL('image/png');
};

interface SignaturePadProps {
    children: React.ReactNode;
    onSave: (signatureDataUrl: string) => void;
    initialOpen?: boolean;
    onCancel?: () => void;
}

type TabType = 'Draw' | 'Image';

export default function SignaturePadComponent({ children, onSave, initialOpen, onCancel }: SignaturePadProps) {
    const [open, setOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('Draw');
    const [penColor, setPenColor] = useState('#000000');

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const signaturePadRef = useRef<SignaturePad | null>(null);

    useEffect(() => {
        if (initialOpen) {
            setOpen(true);
        }
    }, [initialOpen]);

    useEffect(() => {
        if (open && activeTab === 'Draw') {
            const timer = setTimeout(() => {
                if (canvasRef.current) {
                    const canvas = canvasRef.current;
                    const ratio = Math.max(window.devicePixelRatio || 1, 1);
                    canvas.width = canvas.offsetWidth * ratio;
                    canvas.height = canvas.offsetHeight * ratio;
                    const ctx = canvas.getContext('2d');
                    if (ctx) ctx.scale(ratio, ratio);

                    signaturePadRef.current = new SignaturePad(canvas, {
                        minWidth: 1.5,
                        maxWidth: 2.75,
                        penColor: penColor,
                        backgroundColor: 'rgba(255, 255, 255, 0)'
                    });
                }
            }, 50);

            const resizeObserver = new ResizeObserver(() => { });
            if (canvasRef.current) {
                resizeObserver.observe(canvasRef.current);
            }

            return () => {
                clearTimeout(timer);
                resizeObserver.disconnect();
                signaturePadRef.current?.off();
            };
        }
    }, [open, activeTab]);

    useEffect(() => {
        if (signaturePadRef.current) {
            signaturePadRef.current.penColor = penColor;
            signaturePadRef.current.clear();
        }
    }, [penColor]);

    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const { getRootProps, getInputProps } = useDropzone({
        accept: { 'image/*': ['.png', '.jpg', '.jpeg'] },
        onDrop: (acceptedFiles) => {
            const file = acceptedFiles[0];
            const reader = new FileReader();
            reader.onload = () => setUploadedImage(reader.result as string);
            reader.readAsDataURL(file);
        },
        maxFiles: 1
    });

    const handleSave = () => {
        let result: string | null = null;

        if (activeTab === 'Draw' && signaturePadRef.current && canvasRef.current) {
            if (signaturePadRef.current.isEmpty()) {
                alert("Please sign before saving.");
                return;
            }
            result = trimCanvas(canvasRef.current);
        } else if (activeTab === 'Image' && uploadedImage) {
            result = uploadedImage;
        }

        if (result) {
            onSave(result);
            setOpen(false);
        }
    };

    const handleClear = () => {
        if (activeTab === 'Draw') signaturePadRef.current?.clear();
        if (activeTab === 'Image') setUploadedImage(null);
    };

    return (
        <Dialog.Root open={open} onOpenChange={(val) => {
            setOpen(val);
            if (!val && onCancel) {
                onCancel();
            }
        }}>
            <Dialog.Trigger asChild>
                {children}
            </Dialog.Trigger>

            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50 transition-opacity" />
                <Dialog.Content className="fixed z-[998] left-[50%] top-[50%] max-h-[85vh] w-[90vw] max-w-[500px] translate-x-[-50%] translate-y-[-50%] rounded-lg bg-white shadow-xl focus:outline-none overflow-hidden font-sans">
                    <Dialog.Description className="sr-only">Signature Pad</Dialog.Description>

                    <div className="bg-[#f3f4f6] px-6 py-4 border-b border-gray-200">
                        <Dialog.Title className="text-lg font-medium text-gray-900">
                            Add Signature
                        </Dialog.Title>
                    </div>

                    <div className="flex bg-[#f3f4f6] border-b border-gray-200 px-6 pt-3 space-x-6">
                        {(['Draw', 'Image'] as TabType[]).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "pb-3 text-sm font-medium transition-all relative top-[1px]",
                                    activeTab === tab
                                        ? "text-blue-600 border-b-2 border-blue-600"
                                        : "text-gray-500 hover:text-gray-700"
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <div className="p-6 bg-white min-h-[350px] flex flex-col relative">
                        {activeTab === 'Draw' && (
                            <div className="flex gap-3 z-10 pb-3 w-full justify-end">
                                {[
                                    { id: 'black', color: '#000000' },
                                    { id: 'blue', color: '#3B82F6' },
                                    { id: 'indigo', color: '#4338CA' }
                                ].map((c) => (
                                    <button
                                        key={c.id}
                                        onClick={() => setPenColor(c.color)}
                                        className={cn(
                                            "w-6 h-6 rounded-full border border-gray-200",
                                            penColor === c.color
                                                ? "ring-2 ring-blue-500 ring-offset-2"
                                                : "hover:scale-110"
                                        )}
                                        style={{ backgroundColor: c.color }}
                                        aria-label={`Select ${c.id}`}
                                    />
                                ))}
                            </div>
                        )}

                        {activeTab === 'Draw' && (
                            <div className="flex-1 flex flex-col justify-center items-center">
                                <div className="w-full h-64 border-2 border-dashed border-gray-300 rounded-lg relative overflow-hidden bg-white">
                                    <canvas
                                        ref={canvasRef}
                                        className="w-full h-full touch-none cursor-crosshair block"
                                    />
                                </div>
                                <p className="mt-4 text-gray-400 text-sm font-medium">Sign Here</p>
                            </div>
                        )}

                        {activeTab === 'Image' && (
                            <div className="flex-1 flex flex-col justify-center items-center">
                                <div
                                    {...getRootProps()}
                                    className="w-full h-64 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 cursor-pointer hover:bg-gray-100 transition relative overflow-hidden"
                                >
                                    <input {...getInputProps()} />
                                    {uploadedImage ? (
                                        <img src={uploadedImage} alt="Signature" className="object-contain h-full w-full" />
                                    ) : (
                                        <div className="text-center p-4">
                                            <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                                            <p className="text-gray-500 text-sm">Click or Drag & Drop to upload</p>
                                        </div>
                                    )}
                                </div>
                                <p className="mt-4 text-gray-400 text-sm font-medium">Sign above</p>
                            </div>
                        )}
                    </div>

                    <div className="bg-[#f3f4f6] px-4 py-3 sm:px-6 flex flex-row-reverse gap-3">
                        <button
                            type="button"
                            onClick={handleSave}
                            className="inline-flex justify-center rounded-md border border-transparent bg-gray-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 w-auto"
                        >
                            Save & Sign
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setOpen(false);
                            }}
                            className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 w-auto"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleClear}
                            className="mr-auto text-xs text-gray-500 hover:text-red-500 underline"
                        >
                            Clear
                        </button>
                    </div>

                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}