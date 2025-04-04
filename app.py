from flask import Flask, request, jsonify, send_file
import paramiko
import os
import uuid
from io import BytesIO
from datetime import datetime

app = Flask(__name__)

# Store active SFTP connections
connections = {}

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/connect', methods=['POST'])
def connect():
    data = request.get_json()
    host = data.get('host')
    port = data.get('port', 22)
    username = data.get('username')
    password = data.get('password')
    
    if not all([host, username, password]):
        return jsonify({'success': False, 'error': 'Missing required fields'})
    
    try:
        # Create SSH client
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(hostname=host, port=port, username=username, password=password)
        
        # Create SFTP client
        sftp = ssh.open_sftp()
        
        # Generate connection ID
        connection_id = str(uuid.uuid4())
        
        # Store connection
        connections[connection_id] = {
            'ssh': ssh,
            'sftp': sftp
        }
        
        return jsonify({
            'success': True,
            'connection_id': connection_id
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/disconnect', methods=['POST'])
def disconnect():
    data = request.get_json()
    connection_id = data.get('connection_id')
    
    if not connection_id or connection_id not in connections:
        return jsonify({'success': False, 'error': 'Invalid connection ID'})
    
    try:
        # Close SFTP and SSH connections
        connection = connections.pop(connection_id)
        connection['sftp'].close()
        connection['ssh'].close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/list', methods=['POST'])
def list_files():
    data = request.get_json()
    connection_id = data.get('connection_id')
    path = data.get('path', '/')
    
    if not connection_id or connection_id not in connections:
        return jsonify({'success': False, 'error': 'Invalid connection ID'})
    
    try:
        sftp = connections[connection_id]['sftp']
        
        # List files in directory
        files = []
        for item in sftp.listdir_attr(path):
            files.append({
                'name': item.filename,
                'size': item.st_size,
                'mtime': item.st_mtime,
                'type': 'directory' if item.st_mode & 0o40000 else 'file'
            })
        
        return jsonify({
            'success': True,
            'files': files
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/download', methods=['POST'])
def download():
    data = request.get_json()
    connection_id = data.get('connection_id')
    path = data.get('path')
    
    if not connection_id or connection_id not in connections:
        return jsonify({'success': False, 'error': 'Invalid connection ID'}, 400)
    
    try:
        sftp = connections[connection_id]['sftp']
        
        # Check if file exists
        try:
            file_attr = sftp.stat(path)
            if file_attr.st_mode & 0o40000:  # Check if it's a directory
                return jsonify({'success': False, 'error': 'Cannot download directory'}, 400)
        except FileNotFoundError:
            return jsonify({'success': False, 'error': 'File not found'}, 404)
        
        # Create in-memory file
        file_obj = BytesIO()
        sftp.getfo(path, file_obj)
        file_obj.seek(0)
        
        # Get filename from path
        filename = os.path.basename(path)
        
        return send_file(
            file_obj,
            as_attachment=True,
            download_name=filename,
            mimetype='application/octet-stream'
        )
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }, 500)

@app.route('/upload', methods=['POST'])
def upload():
    connection_id = request.form.get('connection_id')
    path = request.form.get('path', '/')
    file = request.files.get('file')
    
    if not connection_id or connection_id not in connections:
        return jsonify({'success': False, 'error': 'Invalid connection ID'})
    
    if not file:
        return jsonify({'success': False, 'error': 'No file provided'})
    
    try:
        sftp = connections[connection_id]['sftp']
        
        # Ensure path ends with /
        if not path.endswith('/'):
            path += '/'
        
        # Upload file
        remote_path = path + file.filename
        sftp.putfo(file.stream, remote_path)
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/mkdir', methods=['POST'])
def mkdir():
    data = request.get_json()
    connection_id = data.get('connection_id')
    path = data.get('path')
    
    if not connection_id or connection_id not in connections:
        return jsonify({'success': False, 'error': 'Invalid connection ID'})
    
    try:
        sftp = connections[connection_id]['sftp']
        sftp.mkdir(path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/rmdir', methods=['POST'])
def rmdir():
    data = request.get_json()
    connection_id = data.get('connection_id')
    path = data.get('path')
    
    if not connection_id or connection_id not in connections:
        return jsonify({'success': False, 'error': 'Invalid connection ID'})
    
    try:
        sftp = connections[connection_id]['sftp']
        
        # Check if directory is empty
        if len(sftp.listdir(path)) > 0:
            return jsonify({
                'success': False,
                'error': 'Directory is not empty'
            })
        
        sftp.rmdir(path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/remove', methods=['POST'])
def remove():
    data = request.get_json()
    connection_id = data.get('connection_id')
    path = data.get('path')
    
    if not connection_id or connection_id not in connections:
        return jsonify({'success': False, 'error': 'Invalid connection ID'})
    
    try:
        sftp = connections[connection_id]['sftp']
        sftp.remove(path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/rename', methods=['POST'])
def rename():
    data = request.get_json()
    connection_id = data.get('connection_id')
    old_path = data.get('old_path')
    new_path = data.get('new_path')
    
    if not connection_id or connection_id not in connections:
        return jsonify({'success': False, 'error': 'Invalid connection ID'})
    
    try:
        sftp = connections[connection_id]['sftp']
        sftp.rename(old_path, new_path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

if __name__ == '__main__':
    app.run(debug=True)

from flask import make_response

@app.after_request
def after_request(response):
    """Ensure all responses are JSON and have proper CORS headers"""
    response.headers['Content-Type'] = 'application/json'
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response

@app.errorhandler(404)
def not_found(error):
    return make_response(jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return make_response(jsonify({'error': 'Internal server error'}), 500)
    
