# Computer-Room-3D-Monitoring
A pure front-end monitoring screen for computer rooms, built using Vue 3, Vue Router, Vuex, Element Plus, Three.js and GLB3D models  
The device data is located in the src\utils\deviceData.js file  
The configuration for pulling data from the dynamic environment server is located in src\utils\sdk.js  
The UPS is not connected to the dynamic environment server, so Python fetches data from the webpage for synchronization. The specific file is located in   public\utils\ups_http_adapter.py
<img width="3200" height="1730" alt="image" src="https://github.com/user-attachments/assets/0a50e6c4-5974-4b5c-be06-0ed185b354a1" />
<img width="3200" height="1730" alt="image" src="https://github.com/user-attachments/assets/895bd0dc-a1be-4a1c-b4d7-202c467d6834" />
#Abnormal devices will be indicated with arrows, example: 
<img width="3200" height="1730" alt="image" src="https://github.com/user-attachments/assets/569d017e-0cec-46d1-acd7-8c3bfef39ae2" />
