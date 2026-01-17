import platform
import subprocess
import re
import sys

# Try importing psutil, but provide fallbacks
try:
    import psutil
    _HAS_PSUTIL = True
except ImportError:
    _HAS_PSUTIL = False

def get_system_specs():
    """
    Detects system RAM (in GB) and architecture.
    Returns a dict like: {"ram_gb": 16, "device": "mps"|"cuda"|"cpu", "arch": "arm64"}
    """
    specs = {
        "ram_gb": 8, # Fallback safe default
        "device": "cpu",
        "arch": platform.machine().lower()
    }

    # 1. RAM Detection
    total_ram_bytes = 0
    
    if _HAS_PSUTIL:
        try:
            total_ram_bytes = psutil.virtual_memory().total
        except Exception:
            pass
    
    # Fallback RAM detection if psutil failed or missing
    if not total_ram_bytes:
        system = platform.system().lower()
        try:
            if "darwin" in system:
                # macOS
                out = subprocess.check_output(["sysctl", "hw.memsize"]).decode("utf-8")
                # Output like "hw.memsize: 17179869184"
                match = re.search(r"hw.memsize:\s*(\d+)", out)
                if match:
                    total_ram_bytes = int(match.group(1))
            elif "linux" in system:
                # Linux (read /proc/meminfo)
                with open("/proc/meminfo", "r") as f:
                    for line in f:
                        if "MemTotal" in line:
                            # MemTotal:       16306560 kB
                            parts = line.split()
                            if len(parts) >= 2:
                                kb = int(parts[1])
                                total_ram_bytes = kb * 1024
                            break
            elif "windows" in system:
                # Windows (wmic)
                out = subprocess.check_output(["wmic", "computersystem", "get", "TotalPhysicalMemory"]).decode("utf-8")
                # Output like "TotalPhysicalMemory \n 17179869184"
                for line in out.split("\n"):
                    line = line.strip()
                    if line.isdigit():
                        total_ram_bytes = int(line)
                        break
        except Exception as e:
            print(f"[Hardware] RAM detection failed: {e}")

    if total_ram_bytes > 0:
        specs["ram_gb"] = int(round(total_ram_bytes / (1024**3)))

    # 2. Device/Accelerator Detection
    # Very basic heuristic. Real detection usually needs torch, but we want to be lightweight here.
    # If we are on Apple Silicon, likely MPS.
    if specs["arch"] == "arm64" and "darwin" in platform.system().lower():
        specs["device"] = "mps"
    
    # Check for NVIDIA (only if nvidia-smi exists)
    try:
        subprocess.check_output(["nvidia-smi"], stderr=subprocess.DEVNULL)
        specs["device"] = "cuda"
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass

    return specs

def suggest_context_limits(specs):
    """
    Returns (base_ctx, max_dynamic_ctx) based on RAM.
    """
    ram = specs["ram_gb"]
    
    # Conservative limits to leave room for OS + Model weights
    # 8GB RAM -> Model takes ~2-4GB -> Context limited
    if ram <= 8:
        return 2048, 4096
    
    # 16GB RAM -> Model ~4-6GB -> Plenty room
    if ram <= 16:
        return 4096, 16384
        
    # 24GB+ RAM (Mac Studio, High end PC)
    if ram <= 32:
        return 8192, 32768
        
    # 64GB+ 
    return 16384, 65536
