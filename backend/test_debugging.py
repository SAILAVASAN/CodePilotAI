import unittest
from debugging.stacktrace_parser import parse_stacktrace
from execution.patch_applier import generate_unified_diff

class TestDebuggingEngine(unittest.TestCase):
    def test_parse_js_stacktrace(self):
        trace = """TypeError: Cannot read properties of undefined (reading 'name')
    at assignRider (rider.service.js:145:12)
    at processOrder (order.controller.js:89:5)"""
        parsed = parse_stacktrace(trace)
        self.assertEqual(parsed["error_type"], "TypeError")
        self.assertEqual(len(parsed["frames"]), 2)
        self.assertEqual(parsed["frames"][0]["file_path"], "rider.service.js")
        self.assertEqual(parsed["frames"][0]["line_number"], 145)
        self.assertEqual(parsed["frames"][0]["function_name"], "assignRider")

    def test_parse_python_traceback(self):
        trace = """Traceback (most recent call last):
  File "backend/services/rider.py", line 145, in assign_rider
    return rider.name
AttributeError: 'NoneType' object has no attribute 'name'"""
        parsed = parse_stacktrace(trace)
        self.assertEqual(parsed["error_type"], "AttributeError")
        self.assertEqual(len(parsed["frames"]), 1)
        self.assertEqual(parsed["frames"][0]["file_path"], "backend/services/rider.py")
        self.assertEqual(parsed["frames"][0]["line_number"], 145)
        self.assertEqual(parsed["frames"][0]["function_name"], "assign_rider")

    def test_generate_unified_diff(self):
        orig = "def foo():\n    return False\n"
        mod = "def foo():\n    return True\n"
        diff = generate_unified_diff(orig, mod, "foo.py")
        self.assertIn("-    return False", diff)
        self.assertIn("+    return True", diff)

if __name__ == "__main__":
    unittest.main()
