import requests

res = requests.post(
    'http://localhost:8000/analyze',
    json={
        'title': 'Testing Notifications',
        'abstract': 'This abstract needs to be at least 40 characters long to pass validation.',
        'workflow': 'Testing',
        'notify_on_completion': True,
        'user_email': 'tester@example.com'
    },
    stream=True
)

for line in res.iter_lines():
    if line:
        print(line.decode('utf-8'))
