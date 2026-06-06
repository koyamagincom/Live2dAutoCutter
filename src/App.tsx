/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Layers, 
  Upload, 
  Download, 
  Settings2, 
  Scissors, 
  Trash2, 
  ChevronRight, 
  Eye, 
  EyeOff,
  Maximize2,
  Image as ImageIcon,
  RotateCcw,
  Sliders,
  Play,
  Pause,
  Plus,
  RefreshCw,
  FolderOpen,
  Info,
  Layers3,
  Minimize2,
  Check,
  ChevronLeft
} from 'lucide-react';
import JSZip from 'jszip';

interface Layer {
  id: string;
  name: string;
  isVisible: boolean;
  imageUrl: string; // Dynamic transparent cropped base64
  bbox: number[]; // [ymin, xmin, ymax, xmax] in 0-1000 scale
  threshold: number; // For customizable white background stripping
}

export default function App() {
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'layout' | 'rigging'>('layout');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);

  // Live Rigging Simulator Sliders
  const [rigBlinkL, setRigBlinkL] = useState(1.0); // 0 to 1
  const [rigBlinkR, setRigBlinkR] = useState(1.0); // 0 to 1
  const [rigHeadYaw, setRigHeadYaw] = useState(0); // -20 to 20 deg
  const [rigHeadRoll, setRigHeadRoll] = useState(0); // -15 to 15 deg
  const [rigHairWind, setRigHairWind] = useState(0); // -10 to 10 deg
  const [isAutoAnimating, setIsAutoAnimating] = useState(false);
  const [animTime, setAnimTime] = useState(0);

  const [genPrompt, setGenPrompt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const SAMPLE_PROMPTS = [
    "Cyberpunk girl with neon highlights, futuristic visor, tech-wear jacket",
    "Fantasy elven prince, ornate ruby armor, ethereal white hair",
    "Gothic lolita witch, oversized hat, purple bow, mystical aura",
    "Tech-ninja assassin, sleek black armor, glowing red eyes, katana"
  ];

  // Auto-breathing animation timer
  useEffect(() => {
    let frameId: number;
    if (isAutoAnimating) {
      const update = () => {
        setAnimTime((prev) => prev + 0.05);
        frameId = requestAnimationFrame(update);
      };
      frameId = requestAnimationFrame(update);
    }
    return () => cancelAnimationFrame(frameId);
  }, [isAutoAnimating]);

  // Hook auto anim parameters
  useEffect(() => {
    if (isAutoAnimating) {
      setRigBlinkL(Math.sin(animTime * 1.5) > 0.85 ? 0.1 : 1.0);
      setRigBlinkR(Math.sin(animTime * 1.5) > 0.85 ? 0.1 : 1.0);
      setRigHeadYaw(Math.sin(animTime * 0.7) * 12);
      setRigHeadRoll(Math.cos(animTime * 0.5) * 6);
      setRigHairWind(Math.sin(animTime * 1.1) * 8);
    }
  }, [animTime, isAutoAnimating]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setBaseImage(event.target?.result as string);
        setLayers([]);
        setSelectedLayerId(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Extract a single part on client using canvas (with background stripping and customized threshold)
  const generatePartCrop = (imgUrl: string, bbox: number[], threshold: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imgUrl;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imgUrl);
          return;
        }

        const width = img.naturalWidth;
        const height = img.naturalHeight;

        // Convert normalized bounding box to pixel coordinates
        const x = Math.max(0, Math.floor((bbox[1] / 1000) * width));
        const y = Math.max(0, Math.floor((bbox[0] / 1000) * height));
        const w = Math.min(width - x, Math.ceil(((bbox[3] - bbox[1]) / 1000) * width));
        const h = Math.min(height - y, Math.ceil(((bbox[2] - bbox[0]) / 1000) * height));

        if (w <= 0 || h <= 0) {
          resolve(imgUrl);
          return;
        }

        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // Intelligent chroma border keying
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // If pixel is lighter than threshold color value, make it transparent
          if (r > threshold && g > threshold && b > threshold) {
            data[i + 3] = 0;
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(imgUrl);
    });
  };

  // Re-crop individual layer when boundaries or threshold change
  const triggerRecrop = async (layerId: string, updatedBbox: number[], updatedThreshold: number) => {
    if (!baseImage) return;
    const croppedUrl = await generatePartCrop(baseImage, updatedBbox, updatedThreshold);
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, bbox: updatedBbox, threshold: updatedThreshold, imageUrl: croppedUrl } : l));
  };

  const analyzeLayers = async () => {
    if (!baseImage) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/analyze-layers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: baseImage })
      });
      const data = await res.json();
      
      if (data.parts) {
        // Initial build model
        const rawLayers: Layer[] = [];
        for (let i = 0; i < data.parts.length; i++) {
          const part = data.parts[i];
          const threshold = 240;
          const croppedUrl = await generatePartCrop(baseImage, part.bbox, threshold);
          rawLayers.push({
            id: `layer-${Date.now()}-${i}`,
            name: part.name,
            isVisible: true,
            imageUrl: croppedUrl,
            bbox: part.bbox,
            threshold
          });
        }
        setLayers(rawLayers);
      }
    } catch (err) {
      console.error(err);
      alert("AI analysis layer detection failed. Please try again with a cleaner image.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const createCustomLayer = async (bbox: number[]) => {
    if (!baseImage) return;
    const defaultName = `custom_part_${layers.length + 1}`;
    const defaultThreshold = 240;
    const croppedUrl = await generatePartCrop(baseImage, bbox, defaultThreshold);
    
    const newL: Layer = {
      id: `layer-${Date.now()}-${layers.length}`,
      name: defaultName,
      isVisible: true,
      imageUrl: croppedUrl,
      bbox,
      threshold: defaultThreshold
    };
    setLayers(prev => [...prev, newL]);
    setSelectedLayerId(newL.id);
  };

  const downloadLayer = (layer: Layer) => {
    const link = document.createElement('a');
    link.href = layer.imageUrl;
    link.download = `${layer.name}.png`;
    link.click();
  };

  // Automated JSZip construction of transparent model assets with manifest metadata file
  const downloadAllAsZip = async () => {
    if (layers.length === 0) return;
    const zip = new JSZip();
    
    // Add images
    layers.forEach((layer) => {
      const base64Data = layer.imageUrl.split(',')[1];
      zip.file(`${layer.name}.png`, base64Data, { base64: true });
    });

    // Add Live2D coordinates alignment file
    const manifest = {
      generator: "Live2D AutoCutter Workstation",
      timestamp: new Date().toISOString(),
      layers: layers.map(l => ({
        name: l.name,
        normalizedBbox: l.bbox,
        alphaThreshold: l.threshold
      }))
    };
    zip.file("layer_positions_manifest.json", JSON.stringify(manifest, null, 2));

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = "Live2D_Separated_Layers.zip";
    link.click();
  };

  const generateCharacter = async (prompt: string) => {
    setIsGenerating(true);
    setShowGenModal(false);
    try {
      const res = await fetch('/api/generate-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      
      if (res.status === 402) {
        alert("Image generation requires a billing-ready Gemini API plan. Please connect a valid developer key in settings.");
        return;
      }

      if (data.imageUrl) {
        setBaseImage(data.imageUrl);
        setLayers([]);
        setSelectedLayerId(null);
      } else if (data.error) {
        alert("Generation Error: " + (data.message || data.error));
      }
    } catch (err) {
      console.error(err);
      alert("Generation failed due to a server connection timeout.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Click & Drag bounding box drawing handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (viewMode !== 'layout' || !baseImage || isAnalyzing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsDrawing(true);
    setDrawStart({ x, y });
    setDrawCurrent({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    setDrawCurrent({ x, y });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart || !drawCurrent) return;
    setIsDrawing(false);

    const rect = e.currentTarget.getBoundingClientRect();
    const x1 = Math.min(drawStart.x, drawCurrent.x);
    const y1 = Math.min(drawStart.y, drawCurrent.y);
    const x2 = Math.max(drawStart.x, drawCurrent.x);
    const y2 = Math.max(drawStart.y, drawCurrent.y);

    const width = rect.width;
    const height = rect.height;

    // Minimum 15px width/height to avoid accidental tiny crops
    if ((x2 - x1) > 15 && (y2 - y1) > 15) {
      // Calculate normalized 0-1000 scales
      const ymin = Math.round((y1 / height) * 1000);
      const xmin = Math.round((x1 / width) * 1000);
      const ymax = Math.round((y2 / height) * 1000);
      const xmax = Math.round((x2 / width) * 1000);

      createCustomLayer([ymin, xmin, ymax, xmax]);
    }

    setDrawStart(null);
    setDrawCurrent(null);
  };

  // Handle fine-tuning coordinates of the currently active layer
  const handleCoordinateSliderChange = (index: number, val: number) => {
    if (!selectedLayerId) return;
    const layer = layers.find(l => l.id === selectedLayerId);
    if (!layer) return;

    const nextBbox = [...layer.bbox];
    nextBbox[index] = val;

    // Boundary correction
    if (index === 0 && nextBbox[0] >= nextBbox[2]) nextBbox[0] = nextBbox[2] - 5;
    if (index === 1 && nextBbox[1] >= nextBbox[3]) nextBbox[1] = nextBbox[3] - 5;
    if (index === 2 && nextBbox[2] <= nextBbox[0]) nextBbox[2] = nextBbox[0] + 5;
    if (index === 3 && nextBbox[3] <= nextBbox[1]) nextBbox[3] = nextBbox[1] + 5;

    triggerRecrop(selectedLayerId, nextBbox, layer.threshold);
  };

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-brutal-gray text-brutal-black font-sans">
      
      {/* Upper Branding Header Toolbar */}
      <header className="h-16 border-b-2 border-brutal-black bg-white flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brutal-green brutal-border flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-mono font-bold text-lg tracking-tighter uppercase leading-none">
              Live2D <span className="bg-brutal-black text-white px-1">AutoCutter</span>
            </h1>
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest opacity-40">AI-Powered Layer Separator</span>
          </div>
        </div>
        
        {/* Toggle Mode Switchers */}
        {baseImage && (
          <div className="flex bg-brutal-gray p-1 brutal-border font-mono text-xs">
            <button 
              onClick={() => setViewMode('layout')}
              className={`px-3 py-1.5 flex items-center gap-1.5 font-bold transition-all ${viewMode === 'layout' ? 'bg-white brutal-border text-brutal-black' : 'opacity-60'}`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Layout Edit
            </button>
            <button 
              onClick={() => setViewMode('rigging')}
              className={`px-3 py-1.5 flex items-center gap-1.5 font-bold transition-all ${viewMode === 'rigging' ? 'bg-brutal-green brutal-border text-brutal-black' : 'opacity-60'}`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Live Rig Simulator
            </button>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              setGenPrompt(SAMPLE_PROMPTS[Math.floor(Math.random() * SAMPLE_PROMPTS.length)]);
              setShowGenModal(true);
            }}
            className="brutal-button bg-brutal-green text-xs"
          >
            <Sparkles className="w-4 h-4 text-black animate-pulse" />
            Character Generator
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="brutal-button text-xs"
          >
            <Upload className="w-4 h-4" />
            Upload Sheet
          </button>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileUpload} 
          />
          
          <button 
            disabled={layers.length === 0}
            onClick={downloadAllAsZip}
            className={`brutal-button bg-brutal-black !text-white text-xs ${layers.length === 0 ? 'opacity-30 cursor-not-allowed' : '!shadow-[3px_3px_0px_0px_rgba(0,255,0,1)]'}`}
          >
            <Download className="w-4 h-4" />
            Export Live2D ZIP
          </button>
        </div>
      </header>

      {/* Primary Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Toolbar - Mode Settings and Quick Instructions */}
        <aside className="w-64 border-r-2 border-brutal-black bg-white flex flex-col p-4 justify-between">
          <div className="space-y-6">
            
            {/* Quick Helper Panel */}
            <div className="p-3 bg-yellow-100 border border-brutal-black font-mono text-[11px] leading-relaxed text-brutal-black/80 space-y-2">
              <div className="flex items-center gap-1.5 font-black text-black text-xs">
                <Info className="w-3.5 h-3.5 text-blue-600" />
                HOW TO LAYER:
              </div>
              <p>1. Upload a portrait design sheet or use AI generation.</p>
              <p>2. Click <strong className="text-black">"Auto-Separate Layers"</strong> to map character body parts.</p>
              <p>3. To manually extract a custom ribbon or wing, <strong className="text-black">click and drag</strong> a box on the character sheet.</p>
            </div>

            {/* Layout edit vs active parameters */}
            {viewMode === 'layout' ? (
              <div className="space-y-4">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wide opacity-50">Layout Tools</h4>
                <div className="flex flex-col gap-2">
                  <div className="p-3 border-2 border-dashed border-brutal-black/30 bg-brutal-gray/20 font-mono text-center text-xs">
                    <p className="font-bold mb-1 uppercase">Slicing Mode Active</p>
                    <p className="text-[10px] opacity-60">Draw selections on the character image directly to crop & strip background dynamically.</p>
                  </div>
                  
                  {layers.length > 0 && (
                    <button 
                      onClick={() => {
                        if (confirm("Are you sure you want to discard all current layers?")) {
                          setLayers([]);
                          setSelectedLayerId(null);
                        }
                      }}
                      className="brutal-button bg-red-100 hover:bg-red-200 text-red-700 justify-center text-xs py-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clear Slices
                    </button>
                  )}
                </div>
              </div>
            ) : (
              // Live Rigging interactive sliders simulation
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wide opacity-50">Rig Parameters</h4>
                  <button 
                    onClick={() => setIsAutoAnimating(!isAutoAnimating)}
                    className={`p-1 border border-brutal-black rounded text-xs flex items-center gap-1 ${isAutoAnimating ? 'bg-brutal-green font-bold' : 'bg-white'}`}
                  >
                    {isAutoAnimating ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    {isAutoAnimating ? 'Pause' : 'Auto'}
                  </button>
                </div>

                <div className="space-y-3 font-mono text-xs">
                  <div>
                    <div className="flex justify-between mb-1 opacity-70">
                      <span>Blink Left</span>
                      <span className="font-bold">{Math.round(rigBlinkL * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.05"
                      value={rigBlinkL}
                      onChange={(e) => {
                        setRigBlinkL(parseFloat(e.target.value));
                        setIsAutoAnimating(false);
                      }}
                      className="w-full accent-black"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1 opacity-70">
                      <span>Blink Right</span>
                      <span className="font-bold">{Math.round(rigBlinkR * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.05"
                      value={rigBlinkR}
                      onChange={(e) => {
                        setRigBlinkR(parseFloat(e.target.value));
                        setIsAutoAnimating(false);
                      }}
                      className="w-full accent-black"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1 opacity-70">
                      <span>Look Turn (Yaw)</span>
                      <span className="font-bold">{rigHeadYaw.toFixed(1)}°</span>
                    </div>
                    <input 
                      type="range" 
                      min="-20" 
                      max="20" 
                      step="0.5"
                      value={rigHeadYaw}
                      onChange={(e) => {
                        setRigHeadYaw(parseFloat(e.target.value));
                        setIsAutoAnimating(false);
                      }}
                      className="w-full accent-black"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1 opacity-70">
                      <span>Head Roll</span>
                      <span className="font-bold">{rigHeadRoll.toFixed(1)}°</span>
                    </div>
                    <input 
                      type="range" 
                      min="-15" 
                      max="15" 
                      step="0.5"
                      value={rigHeadRoll}
                      onChange={(e) => {
                        setRigHeadRoll(parseFloat(e.target.value));
                        setIsAutoAnimating(false);
                      }}
                      className="w-full accent-black"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1 opacity-70">
                      <span>Hair Sway (Wind)</span>
                      <span className="font-bold">{rigHairWind.toFixed(1)}°</span>
                    </div>
                    <input 
                      type="range" 
                      min="-10" 
                      max="10" 
                      step="0.5"
                      value={rigHairWind}
                      onChange={(e) => {
                        setRigHairWind(parseFloat(e.target.value));
                        setIsAutoAnimating(false);
                      }}
                      className="w-full accent-black"
                    />
                  </div>

                  <button 
                    onClick={() => {
                      setRigBlinkL(1.0);
                      setRigBlinkR(1.0);
                      setRigHeadYaw(0);
                      setRigHeadRoll(0);
                      setRigHairWind(0);
                      setIsAutoAnimating(false);
                    }}
                    className="w-full mt-2 border border-brutal-black py-1.5 text-[10px] font-bold uppercase transition-all hover:bg-black hover:text-white"
                  >
                    Reset Rig State
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Stats Summary */}
          <div className="border-t border-brutal-black pt-4 font-mono text-[10px] space-y-1.5 opacity-60">
            <div>PROJECT: LIVE2D MODEL RIG</div>
            <div>LAYERS EXTRACTED: {layers.length}</div>
            <div>STATUS: READY TO RIG</div>
          </div>
        </aside>

        {/* Center Viewport Area */}
        <main className="flex-1 bg-brutal-gray relative flex items-center justify-center p-8 overflow-auto">
          {baseImage ? (
            viewMode === 'layout' ? (
              /* Layout Slicer Area */
              <div 
                ref={imageContainerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                className="relative group brutal-shadow bg-white brutal-border select-none overflow-hidden max-h-[82vh] cursor-crosshair flex items-center justify-center"
              >
                <img 
                  src={baseImage} 
                  alt="Character Base Sheet" 
                  className={`max-h-[78vh] object-contain pointer-events-none ${isAnalyzing ? 'opacity-40 grayscale blur-[1px]' : ''}`}
                  referrerPolicy="no-referrer"
                />
                
                {/* Visualizing Layer bounding boxes on top of sheet */}
                {layers.map((layer) => (
                  layer.isVisible && (
                    <div 
                      key={layer.id}
                      className={`absolute border-2 transition-all cursor-pointer ${selectedLayerId === layer.id ? 'border-brutal-green bg-brutal-green/20 ring-4 ring-black/10' : 'border-brutal-black/30 hover:border-black hover:bg-black/5'}`}
                      style={{
                        top: `${layer.bbox[0] / 10}%`,
                        left: `${layer.bbox[1] / 10}%`,
                        height: `${(layer.bbox[2] - layer.bbox[0]) / 10}%`,
                        width: `${(layer.bbox[3] - layer.bbox[1]) / 10}%`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLayerId(layer.id);
                      }}
                    >
                      <span className="absolute top-0 left-0 bg-brutal-black text-white px-1 text-[8px] font-mono uppercase transform -translate-y-full border border-brutal-black pointer-events-none select-none">
                        {layer.name}
                      </span>
                    </div>
                  )
                ))}

                {/* Draw Indicator Box */}
                {isDrawing && drawStart && drawCurrent && (
                  <div 
                    className="absolute border-2 border-dashed border-blue-600 bg-blue-500/20"
                    style={{
                      left: Math.min(drawStart.x, drawCurrent.x),
                      top: Math.min(drawStart.y, drawCurrent.y),
                      width: Math.abs(drawStart.x - drawCurrent.x),
                      height: Math.abs(drawStart.y - drawCurrent.y),
                    }}
                  />
                )}

                {/* Slicing Progress Banner overlay */}
                {isAnalyzing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                    <div className="bg-white brutal-border p-5 brutal-shadow flex flex-col items-center gap-3">
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                        className="w-10 h-10 border-4 border-brutal-black border-t-brutal-green rounded-full" 
                      />
                      <div className="text-center">
                        <span className="font-mono text-xs font-black uppercase tracking-tight block">Identifying Part Regions</span>
                        <span className="text-[10px] font-mono opacity-50 block">Gemini 3.5 High Vision Precision</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Live Rigging Simulator Area */
              <div className="relative w-[340px] h-[450px] bg-white brutal-border brutal-shadow flex items-center justify-center overflow-hidden">
                {/* Stack and skew transparency layers based on head turn values */}
                <div className="relative w-full h-full scale-[1.1]">
                  
                  {/* Backdrop hairs */}
                  {layers.filter(l => l.name.toLowerCase().includes('back') && l.isVisible).map(layer => {
                    const sway = rigHairWind * 1.4;
                    return (
                      <div 
                        key={layer.id}
                        className="absolute origin-bottom transition-transform duration-100 ease-out"
                        style={{
                          top: `${layer.bbox[0] / 10}%`,
                          left: `${layer.bbox[1] / 10}%`,
                          height: `${(layer.bbox[2] - layer.bbox[0]) / 10}%`,
                          width: `${(layer.bbox[3] - layer.bbox[1]) / 10}%`,
                          transform: `rotate(${sway}deg) translateX(${rigHeadYaw * 0.2}px)`,
                        }}
                      >
                        <img src={layer.imageUrl} className="w-full h-full object-contain" />
                      </div>
                    );
                  })}

                  {/* Neck, Body & Legs (Slight sway for breathing) */}
                  {layers.filter(l => !l.name.toLowerCase().includes('head') && !l.name.toLowerCase().includes('hair') && !l.name.toLowerCase().includes('eye') && !l.name.toLowerCase().includes('brow') && !l.name.toLowerCase().includes('nose') && !l.name.toLowerCase().includes('mouth') && !l.name.toLowerCase().includes('back') && l.isVisible).map(layer => {
                    const breatheY = Math.sin(animTime * 1.5) * 1.5;
                    return (
                      <div 
                        key={layer.id}
                        className="absolute transition-transform duration-150 ease-out"
                        style={{
                          top: `${layer.bbox[0] / 10}%`,
                          left: `${layer.bbox[1] / 10}%`,
                          height: `${(layer.bbox[2] - layer.bbox[0]) / 10}%`,
                          width: `${(layer.bbox[3] - layer.bbox[1]) / 10}%`,
                          transform: `translateY(${breatheY}px)`,
                        }}
                      >
                        <img src={layer.imageUrl} className="w-full h-full object-contain" />
                      </div>
                    );
                  })}

                  {/* Head / Face group container with parallax */}
                  <div 
                    className="absolute inset-0 transition-transform duration-100 ease-out origin-center"
                    style={{
                      transform: `translateX(${rigHeadYaw * 1.5}px) translateY(${Math.abs(rigHeadYaw) * 0.1}px) rotate(${rigHeadRoll}deg)`,
                    }}
                  >
                    {/* Head Skin Layer */}
                    {layers.filter(l => l.name === 'head' && l.isVisible).map(layer => (
                      <div 
                        key={layer.id}
                        className="absolute"
                        style={{
                          top: `${layer.bbox[0] / 10}%`,
                          left: `${layer.bbox[1] / 10}%`,
                          height: `${(layer.bbox[2] - layer.bbox[0]) / 10}%`,
                          width: `${(layer.bbox[3] - layer.bbox[1]) / 10}%`,
                        }}
                      >
                        <img src={layer.imageUrl} className="w-full h-full object-contain" />
                      </div>
                    ))}

                    {/* Left Eye Blink */}
                    {layers.filter(l => l.name.toLowerCase().includes('eye_l') && l.isVisible).map(layer => (
                      <div 
                        key={layer.id}
                        className="absolute origin-center transition-transform duration-100"
                        style={{
                          top: `${layer.bbox[0] / 10}%`,
                          left: `${layer.bbox[1] / 10}%`,
                          height: `${(layer.bbox[2] - layer.bbox[0]) / 10}%`,
                          width: `${(layer.bbox[3] - layer.bbox[1]) / 10}%`,
                          transform: `scaleY(${rigBlinkL}) translateX(${rigHeadYaw * 0.3}px)`,
                        }}
                      >
                        <img src={layer.imageUrl} className="w-full h-full object-contain" />
                      </div>
                    ))}

                    {/* Right Eye Blink */}
                    {layers.filter(l => l.name.toLowerCase().includes('eye_r') && l.isVisible).map(layer => (
                      <div 
                        key={layer.id}
                        className="absolute origin-center transition-transform duration-100"
                        style={{
                          top: `${layer.bbox[0] / 10}%`,
                          left: `${layer.bbox[1] / 10}%`,
                          height: `${(layer.bbox[2] - layer.bbox[0]) / 10}%`,
                          width: `${(layer.bbox[3] - layer.bbox[1]) / 10}%`,
                          transform: `scaleY(${rigBlinkR}) translateX(${rigHeadYaw * 0.3}px)`,
                        }}
                      >
                        <img src={layer.imageUrl} className="w-full h-full object-contain" />
                      </div>
                    ))}

                    {/* Mouth and Nose (Extra Parallax for beautiful perspective shift) */}
                    {layers.filter(l => (l.name.toLowerCase().includes('mouth') || l.name.toLowerCase().includes('nose') || l.name.toLowerCase().includes('eyebrow')) && l.isVisible).map(layer => (
                      <div 
                        key={layer.id}
                        className="absolute transition-transform duration-100"
                        style={{
                          top: `${layer.bbox[0] / 10}%`,
                          left: `${layer.bbox[1] / 10}%`,
                          height: `${(layer.bbox[2] - layer.bbox[0]) / 10}%`,
                          width: `${(layer.bbox[3] - layer.bbox[1]) / 10}%`,
                          transform: `translateX(${rigHeadYaw * 0.5}px)`,
                        }}
                      >
                        <img src={layer.imageUrl} className="w-full h-full object-contain" />
                      </div>
                    ))}

                    {/* Foreground Hair/Front Hairs sway */}
                    {layers.filter(l => l.name.toLowerCase().includes('front') && l.isVisible).map(layer => {
                      const hairSway = rigHairWind * 2.0;
                      return (
                        <div 
                          key={layer.id}
                          className="absolute origin-top transition-transform duration-100"
                          style={{
                            top: `${layer.bbox[0] / 10}%`,
                            left: `${layer.bbox[1] / 10}%`,
                            height: `${(layer.bbox[2] - layer.bbox[0]) / 10}%`,
                            width: `${(layer.bbox[3] - layer.bbox[1]) / 10}%`,
                            transform: `rotate(${hairSway}deg) translateX(${rigHeadYaw * 0.6}px)`,
                          }}
                        >
                          <img src={layer.imageUrl} className="w-full h-full object-contain" />
                        </div>
                      );
                    })}

                    {/* Hair Middle sway */}
                    {layers.filter(l => l.name.toLowerCase().includes('middle') && l.isVisible).map(layer => {
                      const hairSway = rigHairWind * 1.5;
                      return (
                        <div 
                          key={layer.id}
                          className="absolute origin-top transition-transform duration-100"
                          style={{
                            top: `${layer.bbox[0] / 10}%`,
                            left: `${layer.bbox[1] / 10}%`,
                            height: `${(layer.bbox[2] - layer.bbox[0]) / 10}%`,
                            width: `${(layer.bbox[3] - layer.bbox[1]) / 10}%`,
                            transform: `rotate(${hairSway}deg) translateX(${rigHeadYaw * 0.4}px)`,
                          }}
                        >
                          <img src={layer.imageUrl} className="w-full h-full object-contain" />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Rigging Canvas background lines info tag */}
                <div className="absolute bottom-3 left-3 bg-brutal-green brutal-border px-2 py-0.5 font-mono text-[9px] font-bold">
                  2D PARALLAX SIMULATOR
                </div>
              </div>
            )
          ) : (
            <div className="max-w-md text-center flex flex-col items-center gap-6">
              <div className="w-24 h-24 bg-white brutal-border flex items-center justify-center brutal-shadow">
                <ImageIcon className="w-12 h-12 opacity-20" />
              </div>
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Workspace Empty</h2>
                <p className="text-brutal-black/60 font-medium text-sm">Upload an existing 2D anime character portrait or use our custom generative model generator.</p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowGenModal(true)}
                  className="brutal-button bg-brutal-green"
                >
                  Start with AI Generate
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="brutal-button"
                >
                  Upload Local File
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Right Sidebar - Layers listing and Customizable Sliders */}
        <aside className="w-80 border-l-2 border-brutal-black bg-white flex flex-col">
          
          {/* Active fine tuning sliders for selected layer */}
          <div className="border-b-2 border-brutal-black">
            {selectedLayer ? (
              <div className="p-4 space-y-4 bg-brutal-green/5">
                <div className="flex items-center justify-between">
                  <span className="bg-brutal-green text-brutal-black px-2 py-0.5 border border-brutal-black font-mono text-[10px] font-bold uppercase">
                    Tune Part Crop
                  </span>
                  <button 
                    onClick={() => setSelectedLayerId(null)}
                    className="text-xs font-mono font-bold hover:underline"
                  >
                    Close [X]
                  </button>
                </div>

                <div className="space-y-3 font-mono text-[11px]">
                  <div>
                    <span className="opacity-50 block mb-1">PART NAME:</span>
                    <input 
                      type="text" 
                      value={selectedLayer.name}
                      onChange={(e) => {
                        const updatedName = e.target.value;
                        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, name: updatedName } : l));
                      }}
                      className="w-full border-2 border-brutal-black px-2 py-1 bg-white focus:outline-none"
                    />
                  </div>

                  {/* Bounding box dynamic sliders */}
                  <div>
                    <div className="flex justify-between">
                      <span className="opacity-50">TOP EXTENT (YMIN):</span>
                      <span className="font-bold">{selectedLayer.bbox[0]}</span>
                    </div>
                    <input 
                      type="range" min="0" max="1000" value={selectedLayer.bbox[0]}
                      onChange={(e) => handleCoordinateSliderChange(0, parseInt(e.target.value))}
                      className="w-full accent-black"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between">
                      <span className="opacity-50">BOTTOM EXTENT (YMAX):</span>
                      <span className="font-bold">{selectedLayer.bbox[2]}</span>
                    </div>
                    <input 
                      type="range" min="0" max="1000" value={selectedLayer.bbox[2]}
                      onChange={(e) => handleCoordinateSliderChange(2, parseInt(e.target.value))}
                      className="w-full accent-black"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between">
                      <span className="opacity-50">LEFT EXTENT (XMIN):</span>
                      <span className="font-bold">{selectedLayer.bbox[1]}</span>
                    </div>
                    <input 
                      type="range" min="0" max="1000" value={selectedLayer.bbox[1]}
                      onChange={(e) => handleCoordinateSliderChange(1, parseInt(e.target.value))}
                      className="w-full accent-black"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between">
                      <span className="opacity-50">RIGHT EXTENT (XMAX):</span>
                      <span className="font-bold">{selectedLayer.bbox[3]}</span>
                    </div>
                    <input 
                      type="range" min="0" max="1000" value={selectedLayer.bbox[3]}
                      onChange={(e) => handleCoordinateSliderChange(3, parseInt(e.target.value))}
                      className="w-full accent-black"
                    />
                  </div>

                  {/* Dynamic Transparency threshold key */}
                  <div className="bg-white border border-brutal-black p-2 rounded">
                    <div className="flex justify-between items-center mb-1">
                      <span className="opacity-50 font-bold">ALPHA CHROMA KEY:</span>
                      <span className="font-bold bg-brutal-green px-1 border border-brutal-black text-[10px]">{selectedLayer.threshold}</span>
                    </div>
                    <input 
                      type="range" min="150" max="255" value={selectedLayer.threshold}
                      onChange={(e) => triggerRecrop(selectedLayer.id, selectedLayer.bbox, parseInt(e.target.value))}
                      className="w-full accent-black"
                    />
                    <p className="text-[8px] opacity-40 leading-none mt-1">Lower values strips darker off-whites; higher values keeps faint pixels.</p>
                  </div>

                  {/* Direct layer actions */}
                  <div className="flex gap-2">
                    <button 
                      onClick={() => downloadLayer(selectedLayer)}
                      className="brutal-button flex-1 text-[10px] py-1 bg-white justify-center"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PNG
                    </button>
                    <button 
                      onClick={() => {
                        setLayers(prev => prev.filter(l => l.id !== selectedLayerId));
                        setSelectedLayerId(null);
                      }}
                      className="brutal-button text-[10px] py-1 bg-red-100 hover:bg-red-200 text-red-700 font-bold w-12 justify-center"
                      title="Discard layer part"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center font-mono text-[11px] opacity-40 bg-brutal-gray/10">
                Click any part in the manifest to fine-tune its bounds and transparent threshold.
              </div>
            )}
          </div>

          <div className="p-3 border-b-2 border-brutal-black bg-brutal-gray/30 flex items-center justify-between">
            <h3 className="font-mono font-bold uppercase text-xs flex items-center gap-2">
              <Layers3 className="w-4 h-4" />
              Parts List
            </h3>
            <span className="bg-brutal-black text-white px-1.5 text-[10px] font-mono font-bold">
              {layers.length} DETECTED
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 bg-white">
            {layers.length > 0 ? (
              layers.map((layer) => (
                <div 
                  key={layer.id}
                  className={`flex items-center gap-3 p-2 border-2 transition-all cursor-pointer ${selectedLayerId === layer.id ? 'border-brutal-black bg-brutal-green/10' : 'border-transparent hover:bg-brutal-gray/20 text-brutal-black/70 hover:text-brutal-black'}`}
                  onClick={() => setSelectedLayerId(layer.id)}
                >
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setLayers(ls => ls.map(l => l.id === layer.id ? { ...l, isVisible: !l.isVisible } : l));
                    }}
                    className="w-6 h-6 flex items-center justify-center opacity-60 hover:opacity-100"
                  >
                    {layer.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  
                  <div className="w-10 h-10 bg-brutal-gray overflow-hidden border-2 border-brutal-black/20 flex items-center justify-center bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:6px_6px]">
                    <img 
                      src={layer.imageUrl} 
                      alt={layer.name}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  
                  <span className="flex-1 font-mono text-[10px] font-bold uppercase truncate">{layer.name}</span>
                  
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadLayer(layer);
                    }}
                    className="w-6 h-6 flex items-center justify-center hover:bg-brutal-green transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  
                  <ChevronRight className="w-3 h-3 opacity-20" />
                </div>
              ))
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-40 py-20 text-center px-6">
                <Scissors className="w-8 h-8 mb-4 animate-bounce" />
                <p className="text-xs font-mono font-bold uppercase leading-none">No layers sliced</p>
                {baseImage && (
                  <button 
                    onClick={analyzeLayers}
                    className="mt-4 brutal-button bg-brutal-green text-[10px] !py-1 !px-2"
                  >
                    Run Automated Cutter
                  </button>
                )}
              </div>
            )}
          </div>
          
          {/* Actions Footer */}
          <div className="p-4 border-t-2 border-brutal-black bg-white flex flex-col gap-2">
            <button 
              disabled={!baseImage || isAnalyzing}
              onClick={analyzeLayers}
              className={`brutal-button w-full justify-center ${isAnalyzing ? 'opacity-50 cursor-not-allowed' : 'bg-brutal-green'}`}
            >
              {isAnalyzing ? (
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processing...
                </div>
              ) : 'Auto-Separate Layers'}
            </button>
            <p className="text-[9px] font-mono opacity-50 leading-tight block">
              Auto partition extracts Front/Mid/Back hair segments, Left/Right symmetrical eyes, brows, nose, mouth and body parts cleanly.
            </p>
          </div>
        </aside>
      </div>

      {/* Character Forge prompt generation modal */}
      <AnimatePresence>
        {showGenModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGenModal(false)}
              className="absolute inset-0 bg-brutal-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, x: -20, y: -20 }}
              animate={{ scale: 1, opacity: 1, x: 0, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg bg-white brutal-border brutal-shadow relative z-10 p-8"
            >
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <Sparkles className="w-6 h-6 text-brutal-green" />
                  <h2 className="text-3xl font-black uppercase tracking-tighter">AI Character Forge</h2>
                </div>
                <p className="text-sm font-medium opacity-60 font-mono">Create custom high-resolution model sheets natively optimized for automated Live2D layers compilation.</p>
              </div>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                generateCharacter(genPrompt);
              }}>
                <div className="mb-4">
                  <label className="text-[10px] font-mono font-bold uppercase opacity-50 mb-2 block">Quick Prompt Presets</label>
                  <div className="grid grid-cols-2 gap-2">
                    {SAMPLE_PROMPTS.map((sample, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setGenPrompt(sample)}
                        className={`text-[10px] font-mono border-2 border-brutal-black p-2 hover:bg-brutal-green transition-colors text-left truncate ${genPrompt === sample ? 'bg-brutal-green font-bold' : 'bg-white'}`}
                        title={sample}
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea 
                  name="prompt"
                  required
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  placeholder="e.g. A cybernetic priestess with long flowing white hair, wearing an ornate tech-traditional kimono, neutral expression, white studio background..."
                  className="w-full h-28 brutal-border p-4 font-mono text-xs focus:bg-brutal-green/5 focus:outline-none mb-6"
                />
                
                <div className="flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowGenModal(false)}
                    className="brutal-button text-xs"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="brutal-button bg-brutal-black text-white text-xs px-8"
                  >
                    Forge Model Sheet
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Generating Model sheet loading overlay screen */}
      <AnimatePresence>
        {isGenerating && (
          <div className="fixed inset-0 z-[60] bg-brutal-black flex flex-col items-center justify-center text-white">
            <motion.div 
              animate={{ 
                rotate: 360,
                scale: [1, 1.15, 1],
              }}
              transition={{ repeat: Infinity, duration: 1.6 }}
              className="w-20 h-20 border-8 border-brutal-green border-t-white rounded-full mb-6 shadow-[0_0_40px_rgba(0,255,0,0.4)]" 
            />
            <h2 className="text-3xl font-black uppercase tracking-tighter mb-1 animate-pulse">Running Generative Model Forge...</h2>
            <p className="font-mono text-[10px] tracking-widest opacity-60 uppercase">Gemini Generative Engine • Rendering High Res Sheet</p>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
