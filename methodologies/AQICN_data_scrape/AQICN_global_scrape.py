import requests
import pandas as pd
import time

TOKEN = "1993c4ec3d5a6c8a2b60fc3e4bc51cec7a5efa33"

def get_stations(bounds):
    # Using the /v2/ endpoint as discussed for better reliability
    url = f"https://api.waqi.info/v2/map/bounds?latlng={bounds}&token={TOKEN}"
    try:
        response = requests.get(url, timeout=10)
        return response.json().get("data", [])
    except Exception as e:
        print(f"  ⚠️ Request error: {e}")
        return []

all_stations = {}
big_step = 10  # Initial scout tile size
small_step = 2 # Detail zoom tile size

print(f"{'='*50}")
print(f"🚀 STARTING ADAPTIVE GLOBAL SCAN")
print(f"Scout Tile: {big_step}° | Detail Tile: {small_step}°")
print(f"{'='*50}\n")

start_time = time.time()

# Iterating through latitudes and longitudes
for lat in range(-60, 80, big_step):
    for lon in range(-180, 180, big_step):
        scout_bounds = f"{lat},{lon},{lat+big_step},{lon+big_step}"
        
        # 1. Scout phase
        print(f"🔍 Scouting: Lat {lat:3} to {lat+big_step:3}, Lon {lon:4} to {lon+big_step:4}...", end=" ")
        stations = get_stations(scout_bounds)
        
        if stations:
            num_found = len(stations)
            print(f"FOUND {num_found} (Initial). Zooming in...")
            
            # 2. Detail phase (The "Zoom")
            # We break the 10x10 block into 25 smaller 2x2 blocks
            sub_count = 0
            for s_lat in range(lat, lat + big_step, small_step):
                for s_lon in range(lon, lon + big_step, small_step):
                    detail_bounds = f"{s_lat},{s_lon},{s_lat+small_step},{s_lon+small_step}"
                    detail_stations = get_stations(detail_bounds)
                    
                    for s in detail_stations:
                        uid = s.get('uid')
                        if uid and uid not in all_stations:
                            all_stations[uid] = {
                                "ID": uid,
                                "Name": s.get('station', {}).get('name'),
                                "Lat": s.get('lat'),
                                "Lon": s.get('lon'),
                                "AQI": s.get('aqi'),
                                "Last_Updated": s.get('station', {}).get('time')
                            }
                            sub_count += 1
                    
                    time.sleep(0.15) # Polite delay
            
            print(f"   ✨ Added {sub_count} new unique stations. (Total: {len(all_stations)})")
        else:
            print("Empty (Ocean/Desert). Skipping.")

# Final Summary
end_time = time.time()
duration = (end_time - start_time) / 60

print(f"\n{'='*50}")
print(f"✅ SCAN COMPLETE")
print(f"Total Time: {duration:.2f} minutes")
print(f"Total Unique Stations: {len(all_stations)}")
print(f"{'='*50}")

# Save to CSV
if all_stations:
    df = pd.DataFrame(list(all_stations.values()))
    df.to_csv("adaptive_global_results.csv", index=False)
    print("Data saved to 'adaptive_global_results.csv'")
    