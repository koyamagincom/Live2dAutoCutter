/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
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
  Image as ImageIcon
} from 'lucide-react';

interface Layer {
  id: string;
  name: string;
  isVisible: boolean;
  imageUrl: string;
  bbox: number[];
  polygon?: number[][];
}

export default function App() {
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  
  const [genPrompt, setGenPrompt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const SAMPLE_PROMPTS = [
    "Cyberpunk girl with neon highlights, futuristic visor, tech-wear jacket",
    "Fantasy elven prince, ornate ruby armor, ethereal white hair",
    "Gothic lolita witch, oversized hat, purple bow, mystical aura",
    "Tech-ninja assassin, sleek black armor, glowing red eyes, katana"
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setBaseImage(event.target?.result as string);
        setLayers([]);
      };
      reader.readAsDataURL(file);
    }
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
        const newLayers: Layer[] = data.parts.map((part: any, idx: number) => ({
          id: `layer-${idx}`,
          name: part.name,
          isVisible: true,
          imageUrl: part.extractedUrl || baseImage,
          bbox: part.bbox
        }));
        setLayers(newLayers);
      }
    } catch (err) {
      console.error(err);
      alert("Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadLayer = (layer: Layer) => {
    const link = document.createElement('a');
    link.href = layer.imageUrl;
    link.download = `${layer.name}.png`;
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
        alert("Image generation requires a paid Gemini API plan. Please configure your API key in the Settings or click the upgrade button.");
        return;
      }

      if (data.imageUrl) {
        setBaseImage(data.imageUrl);
        setLayers([]);
      } else if (data.error) {
        alert("Generation Error: " + data.message || data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Generation failed due to a network error.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-brutal-gray">
      {/* Header */}
      <header className="h-16 border-b-2 border-brutal-black bg-white flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brutal-green brutal-border flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
          <h1 className="font-mono font-bold text-xl tracking-tighter uppercase">Live2D <span className="bg-brutal-black text-white px-1">AutoCutter</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowGenModal(true)}
            className="brutal-button bg-brutal-green"
          >
            <Sparkles className="w-4 h-4" />
            Generate AI Character
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="brutal-button"
          >
            <Upload className="w-4 h-4" />
            Upload
          </button>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileUpload} 
          />
          
          <button className="brutal-button bg-brutal-black !text-white !shadow-[4px_4px_0px_0px_rgba(0,255,0,1)]">
            <Download className="w-4 h-4" />
            Export PSD
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar */}
        <aside className="w-16 border-r-2 border-brutal-black bg-white flex flex-col items-center py-6 gap-6">
          <button className="w-10 h-10 brutal-border hover:bg-brutal-green transition-colors flex items-center justify-center" title="Select">
            <Maximize2 className="w-5 h-5" />
          </button>
          <button className="w-10 h-10 brutal-border hover:bg-brutal-green transition-colors flex items-center justify-center" title="Scissors">
            <Scissors className="w-5 h-5" />
          </button>
          <button className="w-10 h-10 brutal-border hover:bg-brutal-green transition-colors flex items-center justify-center" title="Edit Mask">
            <Settings2 className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <button className="w-10 h-10 brutal-border hover:bg-red-400 transition-colors flex items-center justify-center text-red-600" title="Delete">
            <Trash2 className="w-5 h-5" />
          </button>
        </aside>

        {/* Viewport Area */}
        <main className="flex-1 bg-brutal-gray relative flex items-center justify-center p-8 overflow-auto">
          {baseImage ? (
            <div className="relative group brutal-shadow bg-white brutal-border overflow-hidden">
              <img 
                src={baseImage} 
                alt="Character Base" 
                className={`max-h-[80vh] object-contain ${isAnalyzing ? 'opacity-50 grayscale' : ''}`}
                referrerPolicy="no-referrer"
              />
              
              {/* Layer Overlays */}
              {layers.map((layer) => (
                layer.isVisible && (
                  <div 
                    key={layer.id}
                    className={`absolute border-2 transition-all cursor-pointer ${selectedLayerId === layer.id ? 'border-brutal-green bg-brutal-green/20' : 'border-transparent hover:border-black/30'}`}
                    style={{
                      top: `${layer.bbox[0] / 10}%`,
                      left: `${layer.bbox[1] / 10}%`,
                      height: `${(layer.bbox[2] - layer.bbox[0]) / 10}%`,
                      width: `${(layer.bbox[3] - layer.bbox[1]) / 10}%`,
                    }}
                    onClick={() => setSelectedLayerId(layer.id)}
                  >
                    {selectedLayerId === layer.id && (
                      <span className="absolute -top-6 left-0 bg-brutal-green px-1 text-[10px] font-mono border border-black uppercase font-bold text-nowrap whitespace-nowrap">
                        {layer.name}
                      </span>
                    )}
                  </div>
                )
              ))}

              {isAnalyzing && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white brutal-border p-4 brutal-shadow flex flex-col items-center gap-2">
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      className="w-8 h-8 border-4 border-brutal-black border-t-brutal-green rounded-full" 
                    />
                    <span className="font-mono text-sm font-bold uppercase">Mapping Neural Layers...</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-md text-center flex flex-col items-center gap-6">
              <div className="w-24 h-24 bg-white brutal-border flex items-center justify-center brutal-shadow">
                <ImageIcon className="w-12 h-12 opacity-20" />
              </div>
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">No Model Projected</h2>
                <p className="text-brutal-black/60 font-medium">Upload a character sheet or use our AI Generator to begin the automated layering process.</p>
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
                  Upload File
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Right Sidebar - Layers */}
        <aside className="w-80 border-l-2 border-brutal-black bg-white flex flex-col">
          <div className="p-4 border-b-2 border-brutal-black bg-brutal-gray/30 flex items-center justify-between">
            <h3 className="font-mono font-bold uppercase text-xs flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Layer Manifest
            </h3>
            <span className="bg-brutal-black text-white px-1.5 text-[10px] font-mono font-bold">
              {layers.length} PARTS
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
            {layers.length > 0 ? (
              layers.map((layer) => (
                <div 
                  key={layer.id}
                  className={`flex items-center gap-3 p-2 border-2 transition-all cursor-pointer ${selectedLayerId === layer.id ? 'border-brutal-black bg-brutal-green/10' : 'border-transparent hover:border-brutal-gray text-brutal-black/70 hover:text-brutal-black'}`}
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
                  
                  <div className="w-10 h-10 bg-brutal-gray overflow-hidden border-2 border-brutal-black/20 flex items-center justify-center">
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
                    <Download className="w-3 h-3" />
                  </button>
                  
                  <ChevronRight className="w-3 h-3 opacity-20" />
                </div>
              ))
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-40 py-20 text-center px-6">
                <Scissors className="w-8 h-8 mb-4" />
                <p className="text-xs font-mono font-bold uppercase">No layers separated yet</p>
                {baseImage && (
                  <button 
                    onClick={analyzeLayers}
                    className="mt-4 brutal-button bg-brutal-green text-[10px] !py-1 !px-2"
                  >
                    Run Auto-Cutter
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
              {isAnalyzing ? 'Analyzing...' : 'Auto-Separate Layers'}
            </button>
            <button 
              disabled={layers.length === 0}
              onClick={() => {
                layers.forEach((l, i) => {
                  setTimeout(() => downloadLayer(l), i * 300);
                });
              }}
              className={`brutal-button w-full justify-center ${layers.length === 0 ? 'opacity-50' : 'bg-brutal-black !text-white'}`}
            >
              <Download className="w-4 h-4 mr-2" />
              Download All PNGs
            </button>
            <p className="text-[9px] font-mono opacity-50 leading-tight block">
              AI identified {layers.length} parts. Symmetric parts separated. Background removed for results.
            </p>
          </div>
        </aside>
      </div>

      {/* Generation Modal */}
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
                <p className="text-sm font-medium opacity-60">Describe your character. We'll generate a high-quality model sheet optimized for Live2D layering.</p>
              </div>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                generateCharacter(genPrompt);
              }}>
                <div className="mb-4">
                  <label className="text-[10px] font-mono font-bold uppercase opacity-50 mb-2 block">Quick Templates</label>
                  <div className="flex flex-wrap gap-2">
                    {SAMPLE_PROMPTS.map((sample, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setGenPrompt(sample)}
                        className="text-[10px] font-mono border border-brutal-black px-2 py-1 hover:bg-brutal-green transition-colors bg-white truncate max-w-[200px]"
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
                  placeholder="e.g. A cybernetic priestess with long flowing white hair, wearing an ornate tech-traditional kimono, neutral expression..."
                  className="w-full h-32 brutal-border p-4 font-mono text-sm focus:bg-brutal-green/5 focus:outline-none mb-6"
                />
                
                <div className="flex justify-end gap-4">
                  <button 
                    type="button"
                    onClick={() => setShowGenModal(false)}
                    className="brutal-button"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="brutal-button bg-brutal-black text-white px-8"
                  >
                    Generate Model
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Loading Overlay for Generation */}
      <AnimatePresence>
        {isGenerating && (
          <div className="fixed inset-0 z-[60] bg-brutal-black flex flex-col items-center justify-center text-white">
            <motion.div 
              animate={{ 
                rotate: 360,
                scale: [1, 1.2, 1],
              }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-24 h-24 border-8 border-brutal-green border-t-white rounded-full mb-8 shadow-[0_0_50px_rgba(0,255,0,0.5)]" 
            />
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-2 animate-pulse">Forging Character...</h2>
            <p className="font-mono text-sm tracking-widest opacity-60 uppercase">Imagen 4.0 Neural Engine</p>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
